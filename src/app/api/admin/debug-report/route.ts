/**
 * One-off diagnostic: inspect a ServiceTitan saved report by ID.
 *
 *   GET /api/admin/debug-report?id=394552917                     // definition only
 *   GET /api/admin/debug-report?id=394552917&run=1&from=...&to=... // run + return rows
 *
 * Uses ST's /reporting/v2 endpoints — different shape than the raw resource
 * endpoints. Rate-limited to 5/min per report. Only intended for ad-hoc
 * reconciliation, not a sync.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAccessToken, readStConfig } from '@/lib/sync/servicetitan/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

interface StReportCategory {
  id: string;
  name?: string;
}

interface StReportListItem {
  id: number | string;
  name?: string;
  description?: string;
  modifiedOn?: string;
  parameters?: unknown;
}

interface StReportListPage {
  page: number;
  pageSize: number;
  hasMore: boolean;
  data: StReportListItem[];
}

interface StReportDefinition {
  id: number | string;
  name?: string;
  description?: string;
  modifiedOn?: string;
  parameters?: Array<{
    name: string;
    label?: string;
    dataType?: string;
    isRequired?: boolean;
    acceptValues?: unknown;
  }>;
  fields?: Array<{ name: string; label?: string; dataType?: string }>;
}

interface StReportDataPage {
  fields: Array<{ name: string; label?: string; dataType?: string }>;
  data: unknown[][];
  hasMore: boolean;
  totalCount?: number;
}

async function listCategories(token: string): Promise<StReportCategory[]> {
  const cfg = readStConfig();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-categories?pageSize=500`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': cfg.appKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`list categories: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data: StReportCategory[] };
  return json.data ?? [];
}

async function findReport(
  token: string,
  reportId: string,
): Promise<{ category: StReportCategory; report: StReportListItem } | null> {
  const cfg = readStConfig();
  const cats = await listCategories(token);
  for (const cat of cats) {
    let page = 1;
    while (true) {
      const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-categories/${cat.id}/reports?page=${page}&pageSize=500`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'ST-App-Key': cfg.appKey,
          Accept: 'application/json',
        },
      });
      if (!res.ok) break;
      const json = (await res.json()) as StReportListPage;
      for (const r of json.data ?? []) {
        if (String(r.id) === reportId) return { category: cat, report: r };
      }
      if (!json.hasMore) break;
      page++;
    }
  }
  return null;
}

async function fetchReportDefinition(
  token: string,
  categoryId: string,
  reportId: string,
): Promise<StReportDefinition> {
  const cfg = readStConfig();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-categories/${categoryId}/reports/${reportId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': cfg.appKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`report def: ${res.status} ${await res.text()}`);
  return (await res.json()) as StReportDefinition;
}

async function runReport(
  token: string,
  categoryId: string,
  reportId: string,
  parameters: Array<{ name: string; value: unknown }>,
): Promise<StReportDataPage> {
  const cfg = readStConfig();
  const url = `${cfg.apiBase}/reporting/v2/tenant/${cfg.tenantId}/report-categories/${categoryId}/reports/${reportId}/data?pageSize=5000`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': cfg.appKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parameters }),
  });
  if (!res.ok) throw new Error(`run report: ${res.status} ${await res.text()}`);
  return (await res.json()) as StReportDataPage;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const reportId = req.nextUrl.searchParams.get('id');
  if (!reportId) {
    return NextResponse.json({ error: 'id param required' }, { status: 400 });
  }

  const shouldRun = req.nextUrl.searchParams.get('run') === '1';
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  try {
    const token = await getAccessToken();
    const found = await findReport(token, reportId);
    if (!found) {
      return NextResponse.json(
        { ok: false, error: `report ${reportId} not found in any category` },
        { status: 404 },
      );
    }

    const def = await fetchReportDefinition(
      token,
      String(found.category.id),
      reportId,
    );

    if (!shouldRun) {
      return NextResponse.json({
        ok: true,
        category: found.category,
        listEntry: found.report,
        definition: def,
      });
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from and to params required when run=1' },
        { status: 400 },
      );
    }

    // Report parameters are typically named things like "From", "To", "DateRange".
    // We best-effort fill any param whose name looks like a date boundary; the
    // caller sees the definition first so they know the exact param names.
    const parameters: Array<{ name: string; value: unknown }> = [];
    const params = def.parameters ?? [];
    for (const p of params) {
      const n = p.name.toLowerCase();
      if (n === 'from' || n === 'fromdate' || n.startsWith('datefrom')) {
        parameters.push({ name: p.name, value: from });
      } else if (n === 'to' || n === 'todate' || n.startsWith('dateto')) {
        parameters.push({ name: p.name, value: to });
      }
    }

    const result = await runReport(
      token,
      String(found.category.id),
      reportId,
      parameters,
    );

    return NextResponse.json({
      ok: true,
      category: found.category,
      listEntry: found.report,
      paramsSent: parameters,
      fieldsReturned: result.fields,
      rowCount: result.data?.length ?? 0,
      totalCount: result.totalCount ?? null,
      // Only include first few rows so we don't blow the payload
      sampleRows: (result.data ?? []).slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
