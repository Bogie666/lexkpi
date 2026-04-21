// Mock data shaped like the real /api/kpi/* responses, with YoY (ly) + 2YA (ly2) siblings.

// Utility to build a comparison-capable KPI: { value, prev, ly, ly2, unit }
const k = (value, prev, ly, ly2, unit = '') => ({ value, prev, ly, ly2, unit });

window.KPI_DATA = {
  period: 'MTD April',
  asOf: 'Apr 20, 2026 · 2:14 PM',
  // Totals, with LY / LY2 for each period granularity
  total: {
    revenue: 2847320, target: 3200000, previousPeriod: 2612840,
    ly: 2484100, ly2: 2218400,
    // Period roll-ups that the period chooser can swap in
    periods: {
      MTD:  { cur: 2847320, ly: 2484100, ly2: 2218400 },
      QTD:  { cur: 7982400, ly: 6812500, ly2: 6102300 },
      YTD:  { cur: 7982400, ly: 6812500, ly2: 6102300 },
      L30:  { cur: 3214800, ly: 2796200, ly2: 2498100 },
      TTM:  { cur: 38412000, ly: 33218000, ly2: 29104000 },
    },
  },
  departments: [
    { id: 'hvac',       name: 'HVAC',            revenue: 1284500, target: 1450000, previousPeriod: 1198200,
      ly: 1102400, ly2: 986500,
      spark:   [78,82,74,91,88,95,102,96,88,92,105,112,108,118,121,115,124,131,128,135],
      lySpark: [68,72,68,80,78,82,88,84,78,82,90,95,92,98,102,98,104,108,106,112] },
    { id: 'plumbing',   name: 'Plumbing',        revenue:  712480, target:  780000, previousPeriod:  684100,
      ly: 648200, ly2: 601100,
      spark:   [42,38,45,52,48,44,51,56,52,49,58,61,57,64,62,66,68,65,71,68],
      lySpark: [38,36,40,46,44,42,46,50,48,46,52,54,52,58,56,60,60,58,63,60] },
    { id: 'electrical', name: 'Electrical',      revenue:  428900, target:  520000, previousPeriod:  412600,
      ly: 396500, ly2: 358200,
      spark:   [22,25,21,28,26,24,30,27,32,29,34,31,36,33,38,35,37,40,42,41],
      lySpark: [20,22,20,26,24,22,27,25,28,26,30,28,32,30,34,32,33,35,37,36] },
    { id: 'commercial', name: 'Commercial HVAC', revenue:  294220, target:  300000, previousPeriod:  218940,
      ly: 209800, ly2: 178400,
      spark:   [8,12,10,14,11,16,14,18,22,20,24,21,26,23,28,25,27,30,29,32],
      lySpark: [6,9,8,11,9,12,11,14,16,15,18,16,20,18,21,19,21,22,22,24] },
    { id: 'maintenance',name: 'Maintenance',     revenue:  127220, target:  150000, previousPeriod:   99000,
      ly: 127200, ly2: 94200,
      spark:   [4,5,6,5,7,6,8,7,9,8,10,9,11,10,12,11,12,13,12,14],
      lySpark: [4,5,6,6,7,7,8,8,9,9,10,10,11,11,11,12,12,12,12,13] },
  ],
  potential: {
    total: 1842000,
    byDept: [
      { id: 'hvac',       name: 'HVAC',            value: 982000 },
      { id: 'plumbing',   name: 'Plumbing',        value: 412000 },
      { id: 'electrical', name: 'Electrical',      value: 268000 },
      { id: 'commercial', name: 'Commercial HVAC', value: 180000 },
    ],
  },
  // Trend now includes lastYear + twoYearsAgo per day so charts can overlay
  trend: [
    { day:1,  actual:78000,   ly:68000,   ly2:60000,   target:106666  },
    { day:2,  actual:142000,  ly:124000,  ly2:110000,  target:213333  },
    { day:3,  actual:221000,  ly:192000,  ly2:171000,  target:320000  },
    { day:4,  actual:312000,  ly:272000,  ly2:242000,  target:426666  },
    { day:5,  actual:401000,  ly:349000,  ly2:312000,  target:533333  },
    { day:6,  actual:498000,  ly:434000,  ly2:387000,  target:640000  },
    { day:7,  actual:582000,  ly:507000,  ly2:452000,  target:746666  },
    { day:8,  actual:671000,  ly:584000,  ly2:521000,  target:853333  },
    { day:9,  actual:764000,  ly:665000,  ly2:593000,  target:960000  },
    { day:10, actual:851000,  ly:741000,  ly2:661000,  target:1066666 },
    { day:11, actual:947000,  ly:824000,  ly2:735000,  target:1173333 },
    { day:12, actual:1048000, ly:912000,  ly2:814000,  target:1280000 },
    { day:13, actual:1142000, ly:994000,  ly2:887000,  target:1386666 },
    { day:14, actual:1241000, ly:1080000, ly2:964000,  target:1493333 },
    { day:15, actual:1348000, ly:1173000, ly2:1047000, target:1600000 },
    { day:16, actual:1463000, ly:1273000, ly2:1136000, target:1706666 },
    { day:17, actual:1582000, ly:1377000, ly2:1228000, target:1813333 },
    { day:18, actual:1698000, ly:1478000, ly2:1319000, target:1920000 },
    { day:19, actual:1821000, ly:1585000, ly2:1414000, target:2026666 },
    { day:20, actual:2847320, ly:2484100, ly2:2218400, target:2133333 },
  ],
  kpis: {
    closeRate:     k(42.8, 39.4, 38.2, 35.9, '%'),
    avgTicket:     k(1284, 1198, 1142, 1068, '$'),
    opportunities: k(2156, 2021, 1882, 1704, ''),
    memberships:   k(8412, 8196, 7608, 6942, ''),
  },
};

window.KPI_TECHS = {
  role: 'Comfort Advisor',
  period: 'MTD April',
  roles: [
    { id: 'comfort_advisor',   label: 'Comfort Advisor', metric: 'Closed revenue', sortKey: 'revenue' },
    { id: 'hvac_tech',         label: 'HVAC Tech',       metric: 'Ticket average', sortKey: 'avgTicket' },
    { id: 'hvac_maintenance',  label: 'HVAC Maint.',     metric: 'Jobs completed', sortKey: 'jobs' },
    { id: 'commercial_hvac',   label: 'Commercial HVAC', metric: 'Closed revenue', sortKey: 'revenue' },
    { id: 'plumbing',          label: 'Plumbing',        metric: 'Closed revenue', sortKey: 'revenue' },
    { id: 'electrical',        label: 'Electrical',      metric: 'Closed revenue', sortKey: 'revenue' },
  ],
  // Team-wide rollup for the compare banner
  team: {
    revenue:     k(1620900, 1498300, 1398600, 1242100),
    closeRate:   k(48.2, 45.8, 43.9, 41.2, '%'),
    avgTicket:   k(5240, 4982, 4612, 4201, '$'),
    jobsDone:    k(308, 284, 262, 238),
    memberships: k(100, 88, 76, 62),
  },
  technicians: [
    { rank: 1, name: 'Marcus Vega',     dept: 'hvac',       revenue: 284500, ly: 241200, closeRate: 58.2, lyCloseRate: 54.1, jobs: 42, lyJobs: 38, avgTicket: 6774, lyAvgTicket: 6348, memberships: 18, trend: 'up',   spark: [30,35,42,38,52,58,62,68,71,74], lySpark: [28,30,34,32,42,48,52,58,60,62] },
    { rank: 2, name: 'Jenna Rhodes',    dept: 'hvac',       revenue: 261200, ly: 218400, closeRate: 54.1, lyCloseRate: 49.8, jobs: 39, lyJobs: 36, avgTicket: 6697, lyAvgTicket: 6067, memberships: 22, trend: 'up',   spark: [28,32,38,44,48,52,58,61,65,68], lySpark: [24,28,32,36,40,42,48,51,54,56] },
    { rank: 3, name: 'David Okafor',    dept: 'hvac',       revenue: 218900, ly: 224100, closeRate: 51.4, lyCloseRate: 52.8, jobs: 36, lyJobs: 38, avgTicket: 6080, lyAvgTicket: 5897, memberships: 14, trend: 'flat', spark: [35,38,34,36,38,40,42,40,44,46], lySpark: [36,40,36,38,40,42,44,42,46,48] },
    { rank: 4, name: 'Priya Nair',      dept: 'plumbing',   revenue: 198400, ly: 162800, closeRate: 49.8, lyCloseRate: 45.2, jobs: 48, lyJobs: 42, avgTicket: 4133, lyAvgTicket: 3876, memberships: 11, trend: 'up',   spark: [22,24,28,30,32,36,38,41,44,48], lySpark: [18,20,22,24,26,28,30,33,36,38] },
    { rank: 5, name: 'Tyrell Booker',   dept: 'hvac',       revenue: 184200, ly: 198600, closeRate: 47.2, lyCloseRate: 50.1, jobs: 31, lyJobs: 34, avgTicket: 5942, lyAvgTicket: 5841, memberships: 9,  trend: 'down', spark: [42,40,38,36,34,32,30,32,30,28], lySpark: [44,42,42,40,40,38,38,40,38,36] },
    { rank: 6, name: 'Sofia Lindqvist', dept: 'electrical', revenue: 162800, ly: 128400, closeRate: 44.6, lyCloseRate: 40.2, jobs: 44, lyJobs: 38, avgTicket: 3700, lyAvgTicket: 3379, memberships: 8,  trend: 'up',   spark: [18,20,24,28,30,34,36,38,42,44], lySpark: [14,16,18,22,24,27,29,31,34,36] },
    { rank: 7, name: 'Kenny Park',      dept: 'plumbing',   revenue: 148600, ly: 142300, closeRate: 42.1, lyCloseRate: 41.8, jobs: 38, lyJobs: 36, avgTicket: 3910, lyAvgTicket: 3952, memberships: 6,  trend: 'flat', spark: [24,26,24,28,26,28,30,28,30,32], lySpark: [22,24,24,26,26,26,28,28,28,30] },
    { rank: 8, name: 'Aisha Martin',    dept: 'hvac',       revenue: 142300, ly: 108200, closeRate: 41.5, lyCloseRate: 36.4, jobs: 29, lyJobs: 26, avgTicket: 4907, lyAvgTicket: 4162, memberships: 12, trend: 'up',   spark: [20,22,24,26,28,30,32,34,36,38], lySpark: [16,18,20,22,23,25,26,28,30,32] },
  ],
};

window.KPI_OPS = {
  period: 'Today',
  callCenter: {
    booked:      k(184, 172, 158, 142),
    bookRate:    k(68.4, 64.2, 61.8, 58.4, '%'),
    avgWait:     k(24, 31, 38, 44, 's'),
    abandonRate: k(3.2, 4.1, 4.8, 5.9, '%'),
    // Hourly pattern with last-year overlay
    hourly: [
      { hr: '6a',  calls: 4,  booked: 2,  lyCalls: 3,  lyBooked: 1 },
      { hr: '7a',  calls: 12, booked: 8,  lyCalls: 9,  lyBooked: 5 },
      { hr: '8a',  calls: 22, booked: 15, lyCalls: 18, lyBooked: 11 },
      { hr: '9a',  calls: 28, booked: 21, lyCalls: 23, lyBooked: 15 },
      { hr: '10a', calls: 31, booked: 22, lyCalls: 26, lyBooked: 17 },
      { hr: '11a', calls: 29, booked: 20, lyCalls: 24, lyBooked: 15 },
      { hr: '12p', calls: 24, booked: 16, lyCalls: 22, lyBooked: 13 },
      { hr: '1p',  calls: 26, booked: 18, lyCalls: 22, lyBooked: 13 },
      { hr: '2p',  calls: 18, booked: 12, lyCalls: 16, lyBooked: 9 },
      { hr: '3p',  calls: 14, booked: 9,  lyCalls: 12, lyBooked: 7 },
    ],
    agents: [
      { name: 'Rachel K.',  calls: 68, booked: 52, rate: 76.5, lyRate: 71.2 },
      { name: 'Marcus D.',  calls: 61, booked: 44, rate: 72.1, lyRate: 68.4 },
      { name: 'Talia P.',   calls: 58, booked: 41, rate: 70.7, lyRate: 66.2 },
      { name: 'Joaquin R.', calls: 54, booked: 36, rate: 66.7, lyRate: 64.8 },
      { name: 'Brianna L.', calls: 49, booked: 31, rate: 63.3, lyRate: 61.4 },
    ],
  },
  memberships: {
    active: 8412, goal: 10000, newMonth: 216, churnMonth: 72, netMonth: 144, newWeek: 58,
    // Last year / two-years-ago snapshots at same point in their year
    ly: { active: 7608, newMonth: 184, churnMonth: 68, netMonth: 116 },
    ly2: { active: 6942, newMonth: 158, churnMonth: 62, netMonth: 96 },
    history:   [7200, 7340, 7480, 7605, 7742, 7860, 7982, 8105, 8210, 8296, 8358, 8412],
    lyHistory: [6480, 6602, 6712, 6820, 6925, 7028, 7128, 7218, 7302, 7385, 7468, 7608],
    breakdown: [
      { tier: 'Cool Club',       count: 5180, lyCount: 4820, price: 19,  color: 'oklch(0.68 0.15 240)' },
      { tier: 'Cool Club Plus',  count: 2344, lyCount: 2068, price: 39,  color: 'oklch(0.68 0.16 295)' },
      { tier: 'Total Comfort',   count:  888, lyCount:  720, price: 89,  color: 'oklch(0.72 0.15 85)' },
    ],
  },
};

window.KPI_ENGAGE = {
  period: 'MTD April',
  reviews: {
    total: 4218, thisMonth: 87, avgRating: 4.87,
    byStar: { 5: 3842, 4: 258, 3: 64, 2: 28, 1: 26 },
    recent: [
      { name: 'Emily R.',   rating: 5, date: 'Apr 19', text: 'Tech was on time, respectful, and walked me through every step. Ten out of ten.' },
      { name: 'Carlos M.',  rating: 5, date: 'Apr 18', text: 'Best HVAC service I have ever used. Quick, honest, and fair pricing.' },
      { name: 'Julia S.',   rating: 4, date: 'Apr 17', text: 'Work was good, scheduling could have been smoother. Still would use again.' },
      { name: 'Anthony B.', rating: 5, date: 'Apr 17', text: 'Plumbing leak fixed in under an hour. Team was fantastic.' },
      { name: 'Nina P.',    rating: 5, date: 'Apr 16', text: 'Membership paid for itself in the first visit.' },
    ],
    trend: [4.82, 4.84, 4.83, 4.85, 4.86, 4.85, 4.87, 4.86, 4.87, 4.88, 4.87, 4.87],
  },
  topPerformers: [
    { name: 'Marcus Vega',   role: 'Comfort Advisor', revenue: 284500, rating: 4.94, reviews: 42 },
    { name: 'Jenna Rhodes',  role: 'Comfort Advisor', revenue: 261200, rating: 4.96, reviews: 38 },
    { name: 'Priya Nair',    role: 'Plumber',         revenue: 198400, rating: 4.92, reviews: 35 },
  ],
};

window.KPI_ANALYZE = {
  period: 'Last 12 Months',
  totals: {
    opportunities:   k(28416, 26108, 24102, 21842),
    closeRate:       k(42.8,  39.4,  37.8,  35.6, '%'),
    unsoldRealistic: k(1842000, 1624000, 1498000, 1318000),
    avgTicket:       k(1284,  1198,  1108,  1024, '$'),
  },
  tierSelection: [
    { tier: 'Low',     count: 412,  pct: 21 },
    { tier: 'Mid',     count: 1048, pct: 52 },
    { tier: 'High',    count: 541,  pct: 27 },
  ],
  timeToClose: [
    { bucket: 'Same day', pct: 38 },
    { bucket: '1–7 days', pct: 44 },
    { bucket: '8+ days',  pct: 18 },
  ],
  seasonality: [
    { m: 'May', close: 38,  ticket: 1180 }, { m: 'Jun', close: 41,  ticket: 1240 },
    { m: 'Jul', close: 44,  ticket: 1310 }, { m: 'Aug', close: 43,  ticket: 1295 },
    { m: 'Sep', close: 40,  ticket: 1220 }, { m: 'Oct', close: 38,  ticket: 1195 },
    { m: 'Nov', close: 37,  ticket: 1205 }, { m: 'Dec', close: 36,  ticket: 1230 },
    { m: 'Jan', close: 39,  ticket: 1250 }, { m: 'Feb', close: 41,  ticket: 1265 },
    { m: 'Mar', close: 43,  ticket: 1278 }, { m: 'Apr', close: 42.8, ticket: 1284 },
  ],
  byDept: [
    { id: 'hvac',       name: 'HVAC',            opps: 12408, closeRate: 44.2, unsold: 982000, avgTicket: 1450 },
    { id: 'plumbing',   name: 'Plumbing',        opps:  7214, closeRate: 41.8, unsold: 412000, avgTicket: 1120 },
    { id: 'electrical', name: 'Electrical',      opps:  4882, closeRate: 39.4, unsold: 268000, avgTicket:  980 },
    { id: 'commercial', name: 'Commercial HVAC', opps:  2412, closeRate: 46.1, unsold: 180000, avgTicket: 2180 },
    { id: 'maintenance',name: 'Maintenance',     opps:  1500, closeRate: 48.6, unsold:  22000, avgTicket:  440 },
  ],
};

window.KPI_TOOLS = [
  { id: 'unsold_estimates',   title: 'Unsold Estimates Processor', sub: 'Process open estimates and export Excel for follow-up.', status: 'Ready' },
  { id: 'email_signature',    title: 'Email Signature Generator',  sub: 'Build branded signatures for employees.', status: 'Ready' },
  { id: 'seer_savings',       title: 'SEER Savings Calculator',    sub: 'Estimate customer energy savings from HVAC upgrades.', status: 'Ready' },
  { id: 'photo_manager',      title: 'Technician Photo Manager',   sub: 'Upload and manage tech headshots used on widgets.', status: 'Ready' },
  { id: 'competition_admin',  title: 'Competition Admin',          sub: 'Configure seasonal leaderboard competitions.', status: 'Admin' },
  { id: 'review_sync',        title: 'Review Sync',                sub: 'Force-sync Google reviews for all locations.', status: 'Scheduled' },
];
