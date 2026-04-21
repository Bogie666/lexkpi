/**
 * Debug helper — fetch the first page of any ST report and return the
 * field definitions + first 3 rows so we can see what columns exist.
 *
 *   GET /api/sync/debug?category=accounting&reportId=128062649&from=2026-04-01&to=2026-04-21
 *
 * Gated by CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readStConfig, getAccessToken } from '@/lib/sync/servicetitan/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const category = params.get('category') ?? 'accounting';
  const reportId = params.get('reportId') ?? '128062649';
  const from = params.get('from') ?? '2026-04-01';
  const to = params.get('to') ?? '2026-04-21';

  try {
    const cfg = readStConfig();
    const token = await getAccessToken(cfg);

    const url = new URL(
      `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${encodeURIComponent(category)}/reports/${encodeURIComponent(reportId)}/data`,
    );
    url.searchParams.set('pageSize', '50');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': cfg.appKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parameters: [
          { name: 'From', value: from },
          { name: 'To', value: to },
        ],
      }),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { ok: false, status: res.status, body: text.slice(0, 2000) },
        { status: 200 },
      );
    }

    const j = json as {
      fields?: Array<{ name: string; label?: string; dataType?: string }>;
      data?: unknown[][];
      totalCount?: number;
      hasMore?: boolean;
    };

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      totalCount: j.totalCount,
      hasMore: j.hasMore,
      fieldCount: j.fields?.length ?? 0,
      fields: j.fields ?? [],
      sampleRows: (j.data ?? []).slice(0, 3),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
