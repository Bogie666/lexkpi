/**
 * Upload + manage employee photos. Backed by Vercel Blob; URL stored on
 * employees.photo_url. Lookup is keyed by normalized name so it matches
 * the ST report's Name field (which is what every fact table joins on).
 *
 *   POST /api/admin/employee-photo
 *     multipart/form-data: { file: File, employeeName: string, roleCode?: string }
 *     → uploads to blob, upserts employees row, returns { url }
 *
 *   DELETE /api/admin/employee-photo?employeeName=...
 *     → clears photo_url and deletes the blob
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { put, del } from '@vercel/blob';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { employees } from '@/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

/** Lowercase + collapse whitespace, drop punctuation. Mirrors the
 *  technician_period employee_name → employees join. */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Safe filename derived from the employee name. Keeps blob keys readable. */
function blobKey(name: string, file: File): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  // Preserve the extension when present; default to png.
  const ext =
    file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ??
    file.type.split('/')[1] ??
    'png';
  // Random suffix so re-uploads don't get cached by the CDN.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `tech-photos/${base || 'employee'}-${suffix}.${ext}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: 'expected multipart/form-data', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const file = form.get('file');
  const employeeName = (form.get('employeeName') as string | null)?.trim();
  const roleCode = (form.get('roleCode') as string | null)?.trim() || null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!employeeName) {
    return NextResponse.json({ error: 'employeeName is required' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (max 10 MB)' }, { status: 413 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: `expected image, got ${file.type}` }, { status: 400 });
  }

  const key = blobKey(employeeName, file);
  const { url } = await put(key, file, {
    access: 'public',
    contentType: file.type,
    addRandomSuffix: false,
  });

  const norm = normalize(employeeName);
  const database = db();

  // Best-effort: if the row exists by normalized name, set photo_url and
  // also delete the previous blob so we don't leak orphaned files.
  const existing = await database
    .select({ id: employees.id, photoUrl: employees.photoUrl })
    .from(employees)
    .where(eq(employees.normalizedName, norm))
    .limit(1);

  if (existing.length > 0) {
    const prior = existing[0].photoUrl;
    await database
      .update(employees)
      .set({ photoUrl: url, updatedAt: new Date() })
      .where(eq(employees.id, existing[0].id));
    if (prior && prior !== url) {
      await del(prior).catch(() => {
        // Don't fail the request just because cleanup of the old blob
        // didn't go through — the new photo is already saved.
      });
    }
  } else {
    await database.insert(employees).values({
      name: employeeName,
      normalizedName: norm,
      roleCode,
      photoUrl: url,
    });
  }

  return NextResponse.json({ ok: true, url, employeeName, normalizedName: norm });
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const employeeName = req.nextUrl.searchParams.get('employeeName')?.trim();
  if (!employeeName) {
    return NextResponse.json({ error: 'employeeName param required' }, { status: 400 });
  }
  const norm = normalize(employeeName);
  const database = db();
  const rows = await database
    .select({ id: employees.id, photoUrl: employees.photoUrl })
    .from(employees)
    .where(eq(employees.normalizedName, norm))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, removed: false, reason: 'not found' });
  }
  const prior = rows[0].photoUrl;
  await database
    .update(employees)
    .set({ photoUrl: null, updatedAt: new Date() })
    .where(eq(employees.id, rows[0].id));
  if (prior) {
    await del(prior).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, removed: true });
}

/** GET: list employees with their current photoUrl. Useful for the admin
 *  page; takes no params. Caps to 500 rows for safety. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const database = db();
  const rows = await database
    .select({
      id: employees.id,
      name: employees.name,
      normalizedName: employees.normalizedName,
      roleCode: employees.roleCode,
      photoUrl: employees.photoUrl,
    })
    .from(employees)
    .orderBy(sql`LOWER(${employees.name})`)
    .limit(500);
  return NextResponse.json({ ok: true, employees: rows });
}
