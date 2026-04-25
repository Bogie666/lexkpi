/**
 * Manual sync trigger. POST with JSON body:
 *   { source: 'financial', from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
 *
 * Gated by CRON_SECRET — pass either as Bearer token or ?secret=… query.
 * Default window is the trailing 7 days (matches the cron path).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { syncFinancial } from '@/lib/sync/servicetitan/financial';
import { syncJobs } from '@/lib/sync/servicetitan/jobs';
import { syncMemberships } from '@/lib/sync/servicetitan/memberships';
import { syncEstimates } from '@/lib/sync/servicetitan/estimates';
import { syncEstimateAnalysisReport } from '@/lib/sync/servicetitan/estimate-analysis-report';
import { syncTechnicians } from '@/lib/sync/servicetitan/technicians';
import { syncTechnicianReports } from '@/lib/sync/servicetitan/technician-reports';
import { syncCallcenter } from '@/lib/sync/servicetitan/callcenter';
import { syncMembershipsBackfill } from '@/lib/sync/servicetitan/memberships-backfill';
import { trailingDays } from '@/lib/sync/window';

export const dynamic = 'force-dynamic';
// Backfill months can pull ~100K invoices each; 300s isn't always enough.
// Vercel Pro allows up to 800s on Node.js serverless functions.
export const maxDuration = 800;

const SOURCES = ['financial', 'jobs', 'memberships', 'memberships-backfill', 'estimates', 'estimate-analysis-report', 'technicians', 'technician-reports', 'callcenter'] as const;
type Source = (typeof SOURCES)[number];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / not yet set
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const query = req.nextUrl.searchParams.get('secret');
  return bearer === secret || query === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { source?: string; from?: string; to?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body is fine — take defaults
  }

  const source = (body.source ?? req.nextUrl.searchParams.get('source') ?? 'financial') as Source;
  if (!SOURCES.includes(source)) {
    return NextResponse.json(
      { error: `unknown source: ${source}. supported: ${SOURCES.join(', ')}` },
      { status: 400 },
    );
  }

  const from = body.from ?? req.nextUrl.searchParams.get('from') ?? undefined;
  const to = body.to ?? req.nextUrl.searchParams.get('to') ?? undefined;
  const window = from && to ? { from, to } : trailingDays(7);

  try {
    if (source === 'financial') {
      const result = await syncFinancial(window, 'manual');
      return NextResponse.json({ ok: true, source, window, ...result });
    }
    if (source === 'jobs') {
      const result = await syncJobs(window, 'manual');
      return NextResponse.json({ ok: true, source, window, ...result });
    }
    if (source === 'memberships') {
      // Memberships endpoint gives us a live snapshot — ignores the window
      // and always writes today's row per tier.
      const result = await syncMemberships('manual');
      return NextResponse.json({ ok: true, source, ...result });
    }
    if (source === 'estimates') {
      // Estimates is also a snapshot — pulls every Open estimate regardless
      // of window.
      const result = await syncEstimates('manual');
      return NextResponse.json({ ok: true, source, ...result });
    }
    if (source === 'estimate-analysis-report') {
      // Window-based: pulls ST report 399168856 for [from,to]. Default = TTM.
      const winFromBody = from && to ? { from, to } : (() => {
        const today = new Date();
        const toISO = today.toISOString().slice(0, 10);
        const f = new Date(today);
        f.setUTCFullYear(f.getUTCFullYear() - 1);
        f.setUTCDate(f.getUTCDate() + 1);
        return { from: f.toISOString().slice(0, 10), to: toISO };
      })();
      const result = await syncEstimateAnalysisReport(winFromBody, 'manual');
      return NextResponse.json({ ok: true, source, window: winFromBody, ...result });
    }
    if (source === 'technicians') {
      const result = await syncTechnicians(window, 'manual');
      return NextResponse.json({ ok: true, source, window, ...result });
    }
    if (source === 'technician-reports') {
      const result = await syncTechnicianReports(window, 'manual');
      return NextResponse.json({ ok: true, source, window, ...result });
    }
    if (source === 'callcenter') {
      const result = await syncCallcenter(window, 'manual');
      return NextResponse.json({ ok: true, source, window, ...result });
    }
    if (source === 'memberships-backfill') {
      const result = await syncMembershipsBackfill(window, 'manual');
      return NextResponse.json({ ok: true, source, window, ...result });
    }
    return NextResponse.json({ error: 'source not yet implemented' }, { status: 501 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, source, window, error: message }, { status: 500 });
  }
}

// Support GET for quick browser-poking while debugging
export const GET = POST;
