/**
 * Mock /api/kpi/callcenter — shape per DATA-SPEC. All rate metrics in bps,
 * wait in seconds, counts are integers. Hourly series overlays ly for
 * compare mode.
 */
import { NextResponse } from 'next/server';
import type { CallCenterResponse } from '@/lib/types/kpi';

export const dynamic = 'force-dynamic';

const PCT_TO_BPS = (n: number) => Math.round(n * 100);

function build(): CallCenterResponse {
  return {
    kpis: {
      booked:      { value: 184,  prev: 172,  ly: 158,  ly2: 142,  unit: 'count'   },
      bookRate:    { value: PCT_TO_BPS(68.4), prev: PCT_TO_BPS(64.2), ly: PCT_TO_BPS(61.8), ly2: PCT_TO_BPS(58.4), unit: 'bps' },
      avgWait:     { value: 24,   prev: 31,   ly: 38,   ly2: 44,   unit: 'seconds' },
      abandonRate: { value: PCT_TO_BPS(3.2), prev: PCT_TO_BPS(4.1), ly: PCT_TO_BPS(4.8), ly2: PCT_TO_BPS(5.9), unit: 'bps' },
    },
    hourly: [
      { hr: '6a',  calls: 4,  booked: 2,  lyCalls: 3,  lyBooked: 1  },
      { hr: '7a',  calls: 12, booked: 8,  lyCalls: 9,  lyBooked: 5  },
      { hr: '8a',  calls: 22, booked: 15, lyCalls: 18, lyBooked: 11 },
      { hr: '9a',  calls: 28, booked: 21, lyCalls: 23, lyBooked: 15 },
      { hr: '10a', calls: 31, booked: 22, lyCalls: 26, lyBooked: 17 },
      { hr: '11a', calls: 29, booked: 20, lyCalls: 24, lyBooked: 15 },
      { hr: '12p', calls: 24, booked: 16, lyCalls: 22, lyBooked: 13 },
      { hr: '1p',  calls: 26, booked: 18, lyCalls: 22, lyBooked: 13 },
      { hr: '2p',  calls: 18, booked: 12, lyCalls: 16, lyBooked: 9  },
      { hr: '3p',  calls: 14, booked: 9,  lyCalls: 12, lyBooked: 7  },
    ],
    agents: [
      { name: 'Rachel K.',  calls: 68, booked: 52, rate: PCT_TO_BPS(76.5), lyRate: PCT_TO_BPS(71.2) },
      { name: 'Marcus D.',  calls: 61, booked: 44, rate: PCT_TO_BPS(72.1), lyRate: PCT_TO_BPS(68.4) },
      { name: 'Talia P.',   calls: 58, booked: 41, rate: PCT_TO_BPS(70.7), lyRate: PCT_TO_BPS(66.2) },
      { name: 'Joaquin R.', calls: 54, booked: 36, rate: PCT_TO_BPS(66.7), lyRate: PCT_TO_BPS(64.8) },
      { name: 'Brianna L.', calls: 49, booked: 31, rate: PCT_TO_BPS(63.3), lyRate: PCT_TO_BPS(61.4) },
    ],
    meta: {
      period: 'Today',
      asOf: new Date().toISOString(),
      from: '2026-04-21',
      to: '2026-04-21',
    },
  };
}

export async function GET() {
  return NextResponse.json({ data: build() });
}
