/**
 * /api/kpi/callcenter — aggregates call_center_daily and call_center_hourly
 * into the existing response shape.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, gte, lte, sql, asc } from 'drizzle-orm';

import { db } from '@/db/client';
import { callCenterDaily, callCenterHourly } from '@/db/schema';
import { resolvePeriod, type Window } from '@/lib/period';
import type { CallCenterResponse, CompareValue } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

function compareValue(
  value: number,
  ly: number | undefined,
  ly2: number | undefined,
  unit: CompareValue['unit'],
  prev?: number,
): CompareValue {
  return { value, prev, ly, ly2, unit };
}

async function aggregateDaily(window: Window) {
  const database = db();
  const rows = await database
    .select({
      calls: sql<number>`COALESCE(SUM(${callCenterDaily.totalCalls}), 0)`,
      booked: sql<number>`COALESCE(SUM(${callCenterDaily.callsBooked}), 0)`,
      // Fall back to the older avg_wait_sec when the new column is null so
      // the UI keeps showing something during/after the column migration.
      avgCallTime: sql<number>`COALESCE(AVG(COALESCE(${callCenterDaily.avgCallTimeSec}, ${callCenterDaily.avgWaitSec}))::int, 0)`,
      avgAbandon: sql<number>`COALESCE(AVG(${callCenterDaily.abandonRateBps})::int, 0)`,
    })
    .from(callCenterDaily)
    .where(
      and(
        gte(callCenterDaily.reportDate, window.from),
        lte(callCenterDaily.reportDate, window.to),
      ),
    );
  return rows[0] ?? { calls: 0, booked: 0, avgCallTime: 0, avgAbandon: 0 };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const period = resolvePeriod({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
  });
  const database = db();

  const [curAgg, lyAgg, ly2Agg] = await Promise.all([
    aggregateDaily(period.cur),
    aggregateDaily(period.ly),
    aggregateDaily(period.ly2),
  ]);

  const calls = Number(curAgg.calls);
  const booked = Number(curAgg.booked);
  const lyCalls = Number(lyAgg.calls);
  const lyBooked = Number(lyAgg.booked);
  const ly2Calls = Number(ly2Agg.calls);
  const ly2Booked = Number(ly2Agg.booked);

  const bookRate = calls > 0 ? Math.round((booked / calls) * 10000) : 0;
  const lyBookRate = lyCalls > 0 ? Math.round((lyBooked / lyCalls) * 10000) : 0;
  const ly2BookRate = ly2Calls > 0 ? Math.round((ly2Booked / ly2Calls) * 10000) : 0;

  // Per-agent rows (current window only)
  const agentRows = await database
    .select({
      name: callCenterDaily.employeeName,
      calls: sql<number>`SUM(${callCenterDaily.totalCalls})`,
      booked: sql<number>`SUM(${callCenterDaily.callsBooked})`,
      rate: sql<number>`AVG(${callCenterDaily.bookingRateBps})::int`,
    })
    .from(callCenterDaily)
    .where(
      and(
        gte(callCenterDaily.reportDate, period.cur.from),
        lte(callCenterDaily.reportDate, period.cur.to),
      ),
    )
    .groupBy(callCenterDaily.employeeName)
    .orderBy(sql`SUM(${callCenterDaily.callsBooked}) DESC`);

  // Per-agent LY rates for compare mode
  const lyAgentRows = await database
    .select({
      name: callCenterDaily.employeeName,
      rate: sql<number>`AVG(${callCenterDaily.bookingRateBps})::int`,
    })
    .from(callCenterDaily)
    .where(
      and(
        gte(callCenterDaily.reportDate, period.ly.from),
        lte(callCenterDaily.reportDate, period.ly.to),
      ),
    )
    .groupBy(callCenterDaily.employeeName);
  const lyRateByName = new Map(lyAgentRows.map((r) => [r.name, Number(r.rate)]));

  // Hourly — take the latest day in-window for pacing display
  const hourlyRows = await database
    .select()
    .from(callCenterHourly)
    .where(eq(callCenterHourly.reportDate, period.cur.to))
    .orderBy(asc(callCenterHourly.hour));

  const lyHourlyRows = await database
    .select()
    .from(callCenterHourly)
    .where(eq(callCenterHourly.reportDate, period.ly.to))
    .orderBy(asc(callCenterHourly.hour));
  const lyHourly = new Map(lyHourlyRows.map((r) => [r.hour, { total: r.totalCalls, booked: r.callsBooked }]));

  const fmtHour = (h: number) => {
    if (h === 0) return '12a';
    if (h < 12) return `${h}a`;
    if (h === 12) return '12p';
    return `${h - 12}p`;
  };

  const body: CallCenterResponse = {
    kpis: {
      booked: compareValue(booked, lyBooked, ly2Booked, 'count'),
      bookRate: compareValue(bookRate, lyBookRate, ly2BookRate, 'bps'),
      avgCallTime: compareValue(Number(curAgg.avgCallTime), Number(lyAgg.avgCallTime), Number(ly2Agg.avgCallTime), 'seconds'),
      abandonRate: compareValue(Number(curAgg.avgAbandon), Number(lyAgg.avgAbandon), Number(ly2Agg.avgAbandon), 'bps'),
    },
    hourly: hourlyRows.map((h) => {
      const lyH = lyHourly.get(h.hour);
      return {
        hr: fmtHour(h.hour),
        calls: h.totalCalls,
        booked: h.callsBooked,
        lyCalls: lyH?.total,
        lyBooked: lyH?.booked,
      };
    }),
    agents: agentRows.map((a) => ({
      name: a.name,
      calls: Number(a.calls),
      booked: Number(a.booked),
      rate: Number(a.rate),
      lyRate: lyRateByName.get(a.name),
    })),
    meta: {
      period: period.preset ? period.preset.toUpperCase() : 'Custom',
      asOf: new Date().toISOString(),
      from: period.cur.from,
      to: period.cur.to,
    },
  };

  return NextResponse.json({ data: body });
}
