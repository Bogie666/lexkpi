/**
 * ST introspection helpers.
 *
 *   GET /api/sync/debug?mode=categories
 *       → lists all report categories and their URL slugs
 *
 *   GET /api/sync/debug?mode=reports&category=<slug>
 *       → lists all reports in a category (id, name, description, parameters)
 *
 *   GET /api/sync/debug?category=<slug>&reportId=<id>&from=&to=&rows=
 *       → fetches the first page of a report, returns fields + sample rows
 *
 * All three are gated by CRON_SECRET.
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

async function stGet(path: string): Promise<{ status: number; body: unknown }> {
  const cfg = readStConfig();
  const token = await getAccessToken(cfg);
  const res = await fetch(`${cfg.apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': cfg.appKey,
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 2000);
  }
  return { status: res.status, body };
}

async function listCategories() {
  const cfg = readStConfig();
  const { status, body } = await stGet(
    `/reporting/v2/tenant/${cfg.tenantId}/report-categories`,
  );
  return { status, body };
}

async function listReports(category: string) {
  const cfg = readStConfig();
  const { status, body } = await stGet(
    `/reporting/v2/tenant/${cfg.tenantId}/report-category/${encodeURIComponent(category)}/reports`,
  );
  return { status, body };
}

async function fetchReportPage(args: {
  category: string;
  reportId: string;
  from: string;
  to: string;
  rows: number;
}) {
  const cfg = readStConfig();
  const token = await getAccessToken(cfg);

  const url = new URL(
    `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-category/${encodeURIComponent(args.category)}/reports/${encodeURIComponent(args.reportId)}/data`,
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
        { name: 'From', value: args.from },
        { name: 'To', value: args.to },
      ],
    }),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, body: text.slice(0, 2000) };
  }
  const j = json as {
    fields?: Array<{ name: string; label?: string; dataType?: string }>;
    data?: unknown[][];
    totalCount?: number;
    hasMore?: boolean;
  };
  return {
    ok: res.ok,
    status: res.status,
    totalCount: j.totalCount,
    hasMore: j.hasMore,
    fieldCount: j.fields?.length ?? 0,
    fields: j.fields ?? [],
    sampleRows: (j.data ?? []).slice(0, args.rows),
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const mode = params.get('mode');

  try {
    if (mode === 'categories') {
      const { status, body } = await listCategories();
      return NextResponse.json({ ok: status < 400, status, body });
    }

    if (mode === 'reports') {
      const category = params.get('category');
      if (!category) {
        return NextResponse.json({ error: 'category required' }, { status: 400 });
      }
      const { status, body } = await listReports(category);
      return NextResponse.json({ ok: status < 400, status, category, body });
    }

    // Default: fetch report data
    const category = params.get('category') ?? 'accounting';
    const reportId = params.get('reportId') ?? '128062649';
    const from = params.get('from') ?? '2026-04-01';
    const to = params.get('to') ?? '2026-04-21';
    const rows = Math.min(Number(params.get('rows') ?? 10), 200);
    const result = await fetchReportPage({ category, reportId, from, to, rows });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
