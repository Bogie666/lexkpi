/**
 * Call Center sync — pulls /telecom/v3/calls and writes per-agent-per-day
 * + hourly pacing rows. Derives the four dashboard KPIs directly from the
 * raw call records:
 *
 *   - totalCalls     = count of inbound calls
 *   - callsBooked    = count of inbound calls where jobNumber is set
 *   - avgCallTimeSec = avg duration across non-abandoned calls
 *   - abandonRateBps = abandoned / total × 10000
 *
 * Upsert key:
 *   call_center_daily: (employeeName, reportDate)
 *   call_center_hourly: (reportDate, hour)
 *
 * Inbound-only: outbound calls aren't part of the booking funnel. Null
 * agent (usually an Abandoned call) gets bucketed under 'Unassigned' so
 * the team totals stay correct when we SUM per-agent rows.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { callCenterDaily, callCenterHourly } from '@/db/schema';
import { collectResource } from './raw-client';
import {
  startSyncRun,
  finishSyncRunSuccess,
  finishSyncRunError,
  type SyncTrigger,
} from '@/lib/sync/runs';

export const CALLCENTER_SOURCE = 'st_callcenter';

export interface SyncWindow {
  from: string;
  to: string;
}

export interface CallcenterSyncResult {
  runId: number | null;
  skipped?: 'another_run_active';
  callsFetched: number;
  inboundFetched: number;
  dailyRowsUpserted: number;
  hourlyRowsUpserted: number;
  agentCount: number;
}

interface StCall {
  id: number;
  jobNumber?: string | null;
  leadCall?: {
    id?: number;
    receivedOn?: string;
    duration?: string; // HH:MM:SS
    direction?: string; // Inbound | Outbound
    callType?: string; // Abandoned | Excused | ...
    agent?: { id?: number; name?: string } | null;
  } | null;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM:SS" → total seconds. */
function parseDuration(s: string | null | undefined): number {
  if (!s) return 0;
  const [hh, mm, ss] = s.split(':').map((x) => Number(x) || 0);
  return hh * 3600 + mm * 60 + ss;
}

/**
 * ST emits `receivedOn` as a UTC ISO timestamp. We bucket by *local*
 * (America/Chicago) date + hour so the dashboard's hourly pacing chart
 * reads naturally — a call taken at 8am CT shows up as "8a", not as
 * the UTC equivalent that swings 5–6 hours forward.
 */
const LOCAL_TZ = 'America/Chicago';
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: LOCAL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hourFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: LOCAL_TZ,
  hour: '2-digit',
  hour12: false,
});

function localBucket(receivedOn: string): { date: string; hour: number } {
  const d = new Date(receivedOn);
  const date = dateFmt.format(d); // en-CA → YYYY-MM-DD
  // hourFmt may emit "00" through "23" — sometimes "24" at midnight in
  // some locales, so coerce defensively.
  const raw = Number(hourFmt.format(d));
  const hour = ((raw % 24) + 24) % 24;
  return { date, hour };
}

export async function syncCallcenter(
  window: SyncWindow,
  trigger: SyncTrigger,
): Promise<CallcenterSyncResult> {
  const start = await startSyncRun({
    source: CALLCENTER_SOURCE,
    trigger,
    reportId: 'callcenter',
    windowStart: window.from,
    windowEnd: window.to,
  });
  if (start.status === 'skipped') {
    return {
      runId: null,
      skipped: start.reason,
      callsFetched: 0,
      inboundFetched: 0,
      dailyRowsUpserted: 0,
      hourlyRowsUpserted: 0,
      agentCount: 0,
    };
  }
  const runId = start.runId;

  try {
    // Pull every call received in the window. `createdOnOrAfter` filters
    // by record creation time, which aligns with receivedOn for Inbound
    // calls in practice.
    const calls = await collectResource<StCall>({
      path: '/telecom/v3/tenant/{tenant}/calls',
      query: {
        createdOnOrAfter: `${window.from}T00:00:00Z`,
        createdBefore: `${shiftDate(window.to, 1)}T00:00:00Z`,
      },
    });

    type DailyAgg = {
      reportDate: string;
      employeeName: string;
      total: number;
      booked: number;
      durationSumSec: number; // across engaged calls only
      engagedCount: number;
      abandoned: number;
    };
    type HourlyAgg = {
      reportDate: string;
      hour: number;
      total: number;
      booked: number;
    };

    const daily = new Map<string, DailyAgg>();
    const hourly = new Map<string, HourlyAgg>();
    const agents = new Set<string>();
    let inboundCount = 0;

    for (const c of calls) {
      const lc = c.leadCall;
      if (!lc) continue;
      if (lc.direction && lc.direction.toLowerCase() !== 'inbound') continue;
      if (!lc.receivedOn) continue;
      inboundCount++;
      const { date, hour } = localBucket(lc.receivedOn);
      const agentName = lc.agent?.name?.trim() || 'Unassigned';
      const isBooked = !!c.jobNumber;
      const isAbandoned = (lc.callType || '').toLowerCase() === 'abandoned';
      const durationSec = parseDuration(lc.duration);

      // daily per-agent
      const dayKey = `${agentName}|${date}`;
      const d = daily.get(dayKey) ?? {
        reportDate: date,
        employeeName: agentName,
        total: 0,
        booked: 0,
        durationSumSec: 0,
        engagedCount: 0,
        abandoned: 0,
      };
      d.total += 1;
      if (isBooked) d.booked += 1;
      if (isAbandoned) d.abandoned += 1;
      else {
        d.durationSumSec += durationSec;
        d.engagedCount += 1;
      }
      daily.set(dayKey, d);
      agents.add(agentName);

      // hourly team-wide
      const hourKey = `${date}|${hour}`;
      const h = hourly.get(hourKey) ?? {
        reportDate: date,
        hour,
        total: 0,
        booked: 0,
      };
      h.total += 1;
      if (isBooked) h.booked += 1;
      hourly.set(hourKey, h);
    }

    const database = db();

    // Daily rows
    const dailyRows = Array.from(daily.values()).map((r) => ({
      employeeName: r.employeeName,
      reportDate: r.reportDate,
      totalCalls: r.total,
      callsBooked: r.booked,
      bookingRateBps: r.total > 0 ? Math.round((r.booked / r.total) * 10000) : null,
      avgWaitSec: null, // deprecated; we report avgCallTimeSec instead
      avgCallTimeSec: r.engagedCount > 0 ? Math.round(r.durationSumSec / r.engagedCount) : null,
      abandonRateBps: r.total > 0 ? Math.round((r.abandoned / r.total) * 10000) : null,
      sourceReportId: CALLCENTER_SOURCE,
    }));

    // Purge any old source rows for the window so removed agents disappear
    await database
      .delete(callCenterDaily)
      .where(
        and(
          eq(callCenterDaily.sourceReportId, CALLCENTER_SOURCE),
          gte(callCenterDaily.reportDate, window.from),
          lte(callCenterDaily.reportDate, window.to),
        ),
      );
    // Also wipe seeded rows for the window so they don't double-count
    await database
      .delete(callCenterDaily)
      .where(
        and(
          eq(callCenterDaily.sourceReportId, 'seed'),
          gte(callCenterDaily.reportDate, window.from),
          lte(callCenterDaily.reportDate, window.to),
        ),
      );

    let dailyUpserted = 0;
    if (dailyRows.length > 0) {
      for (let i = 0; i < dailyRows.length; i += 500) {
        const batch = dailyRows.slice(i, i + 500);
        await database
          .insert(callCenterDaily)
          .values(batch)
          .onConflictDoUpdate({
            target: [callCenterDaily.employeeName, callCenterDaily.reportDate],
            set: {
              totalCalls: sql.raw(`excluded.total_calls`),
              callsBooked: sql.raw(`excluded.calls_booked`),
              bookingRateBps: sql.raw(`excluded.booking_rate_bps`),
              avgCallTimeSec: sql.raw(`excluded.avg_call_time_sec`),
              abandonRateBps: sql.raw(`excluded.abandon_rate_bps`),
              sourceReportId: sql.raw(`excluded.source_report_id`),
              syncedAt: new Date(),
            },
          });
        dailyUpserted += batch.length;
      }
    }

    // Hourly rows
    const hourlyRows = Array.from(hourly.values()).map((r) => ({
      reportDate: r.reportDate,
      hour: r.hour,
      totalCalls: r.total,
      callsBooked: r.booked,
      sourceReportId: CALLCENTER_SOURCE,
    }));

    await database
      .delete(callCenterHourly)
      .where(
        and(
          gte(callCenterHourly.reportDate, window.from),
          lte(callCenterHourly.reportDate, window.to),
        ),
      );

    let hourlyUpserted = 0;
    if (hourlyRows.length > 0) {
      for (let i = 0; i < hourlyRows.length; i += 500) {
        const batch = hourlyRows.slice(i, i + 500);
        // Upsert (not plain INSERT) — local-bucketed dates can land
        // outside the UTC delete window (a call at 11pm CT yesterday
        // buckets to yesterday's local date but our DELETE only covered
        // the UTC window), so a stale row with the same (date, hour)
        // key may still exist.
        await database
          .insert(callCenterHourly)
          .values(batch)
          .onConflictDoUpdate({
            target: [callCenterHourly.reportDate, callCenterHourly.hour],
            set: {
              totalCalls: sql.raw(`excluded.total_calls`),
              callsBooked: sql.raw(`excluded.calls_booked`),
              syncedAt: new Date(),
            },
          });
        hourlyUpserted += batch.length;
      }
    }

    await finishSyncRunSuccess(runId, {
      rowsFetched: calls.length,
      rowsUpserted: dailyUpserted + hourlyUpserted,
    });

    return {
      runId,
      callsFetched: calls.length,
      inboundFetched: inboundCount,
      dailyRowsUpserted: dailyUpserted,
      hourlyRowsUpserted: hourlyUpserted,
      agentCount: agents.size,
    };
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    await finishSyncRunError(runId, msg);
    throw err;
  }
}
