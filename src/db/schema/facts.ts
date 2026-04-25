import {
  pgTable,
  serial,
  text,
  date,
  integer,
  bigint,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * One row per technician per day — never deleted. Every period (MTD / QTD /
 * YTD / L30 / TTM / custom) is just a WHERE on report_date plus a GROUP BY.
 */
export const technicianDaily = pgTable(
  'technician_daily',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id').notNull(),
    employeeName: text('employee_name').notNull(),
    roleCode: text('role_code').notNull(),
    departmentCode: text('department_code'),
    reportDate: date('report_date').notNull(),

    revenueCents: bigint('revenue_cents', { mode: 'number' }).notNull().default(0),
    jobsCompleted: integer('jobs_completed').notNull().default(0),
    closeRateBps: integer('close_rate_bps'),
    recallRateBps: integer('recall_rate_bps'),
    avgTicketCents: bigint('avg_ticket_cents', { mode: 'number' }),
    memberships: integer('memberships').notNull().default(0),
    leadsSet: integer('leads_set').notNull().default(0),
    opportunities: integer('opportunities').notNull().default(0),

    sourceReportId: text('source_report_id').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('tech_daily_uniq').on(t.employeeId, t.reportDate, t.roleCode),
    dateIdx: index('tech_daily_date_idx').on(t.reportDate),
    deptDate: index('tech_daily_dept_date').on(t.departmentCode, t.reportDate),
    roleDate: index('tech_daily_role_date').on(t.roleCode, t.reportDate),
  }),
);

/** Financial daily — department revenue. */
export const financialDaily = pgTable(
  'financial_daily',
  {
    id: serial('id').primaryKey(),
    departmentCode: text('department_code').notNull(),
    reportDate: date('report_date').notNull(),

    totalRevenueCents: bigint('total_revenue_cents', { mode: 'number' }).notNull().default(0),
    jobs: integer('jobs').notNull().default(0),
    opportunities: integer('opportunities').notNull().default(0),
    closedOpportunities: integer('closed_opportunities').notNull().default(0),

    sourceReportId: text('source_report_id').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('fin_daily_uniq').on(t.departmentCode, t.reportDate),
    dateIdx: index('fin_daily_date_idx').on(t.reportDate),
  }),
);

/** Call center daily — per-agent metrics. */
export const callCenterDaily = pgTable(
  'call_center_daily',
  {
    id: serial('id').primaryKey(),
    employeeName: text('employee_name').notNull(),
    reportDate: date('report_date').notNull(),

    totalCalls: integer('total_calls').notNull().default(0),
    callsBooked: integer('calls_booked').notNull().default(0),
    bookingRateBps: integer('booking_rate_bps'),
    avgWaitSec: integer('avg_wait_sec'),
    avgCallTimeSec: integer('avg_call_time_sec'),
    abandonRateBps: integer('abandon_rate_bps'),

    sourceReportId: text('source_report_id').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('cc_daily_uniq').on(t.employeeName, t.reportDate),
    dateIdx: index('cc_daily_date_idx').on(t.reportDate),
  }),
);

/** Hourly call-center pacing — used for the "Calls vs bookings" chart today. */
export const callCenterHourly = pgTable(
  'call_center_hourly',
  {
    id: serial('id').primaryKey(),
    reportDate: date('report_date').notNull(),
    hour: integer('hour').notNull(), // 0-23
    totalCalls: integer('total_calls').notNull().default(0),
    callsBooked: integer('calls_booked').notNull().default(0),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('cc_hourly_uniq').on(t.reportDate, t.hour),
    dateIdx: index('cc_hourly_date_idx').on(t.reportDate),
  }),
);

/**
 * Estimate analysis — raw estimate records. Unlike the daily fact tables,
 * these are individual records; aggregation happens at query time.
 */
export const estimateAnalysis = pgTable(
  'estimate_analysis',
  {
    id: serial('id').primaryKey(),
    estimateId: text('estimate_id').notNull().unique(),
    // ST jobId the estimate is attached to. Nullable: seeded rows and
    // standalone estimates don't have one. Techs leave good/better/best
    // sets per job, so we group by jobId and average when rolling up to
    // avoid triple-counting a single customer's pipeline.
    jobId: bigint('job_id', { mode: 'number' }),
    opportunityStatus: text('opportunity_status').notNull(), // 'won' | 'unsold' | 'dismissed'
    /** Raw ST OpportunityStatus string ("Open", "Not Attempted", "Sold",
     *  "Dismissed", etc.). Lets the financial page filter potential
     *  revenue to actively-being-worked leads only — without this we'd
     *  count "Not Attempted" estimates as live pipeline. */
    opportunityStatusRaw: text('opportunity_status_raw'),
    soldOn: date('sold_on'),
    createdOn: date('created_on').notNull(),
    subtotalCents: bigint('subtotal_cents', { mode: 'number' }).notNull().default(0),
    departmentCode: text('department_code'),
    timeToCloseDays: integer('time_to_close_days'),
    tierSelected: text('tier_selected'), // 'low' | 'mid' | 'high' | null
    sourceReportId: text('source_report_id').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    createdIdx: index('ea_created_idx').on(t.createdOn),
    statusIdx: index('ea_status_idx').on(t.opportunityStatus),
    deptIdx: index('ea_dept_idx').on(t.departmentCode),
    jobIdx: index('ea_job_idx').on(t.jobId),
  }),
);

/**
 * Technician performance snapshot — per-tech aggregates for a period
 * (MTD, YTD, TTM, LY-MTD, etc.). Sourced from ST's "Ryan ... Dashboard
 * Tech KPI" reports which come pre-filtered to the right techs per
 * role. One row per (role, period, tech).
 */
export const technicianPeriod = pgTable(
  'technician_period',
  {
    id: serial('id').primaryKey(),
    roleCode: text('role_code').notNull(), // matches technician_roles.code
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    employeeId: bigint('employee_id', { mode: 'number' }).notNull(),
    employeeName: text('employee_name').notNull(),

    // Core KPI fields pulled from the ST report.
    completedJobs: integer('completed_jobs').notNull().default(0),
    completedRevenueCents: bigint('completed_revenue_cents', { mode: 'number' }).notNull().default(0),
    opportunity: integer('opportunity').notNull().default(0),
    salesOpportunity: integer('sales_opportunity').notNull().default(0),
    closedOpportunities: integer('closed_opportunities').notNull().default(0),
    closeRateBps: integer('close_rate_bps'),
    totalSalesCents: bigint('total_sales_cents', { mode: 'number' }).notNull().default(0),
    /** TotalJobAverage from ST — displayed as "Avg ticket" on non-CA pages. */
    totalJobAverageCents: bigint('total_job_average_cents', { mode: 'number' }).notNull().default(0),
    optionsPerOpportunity: integer('options_per_opportunity_x100'), // *100 since it's a decimal
    membershipsSold: integer('memberships_sold').notNull().default(0),
    leadsSet: integer('leads_set').notNull().default(0),
    totalLeadSalesCents: bigint('total_lead_sales_cents', { mode: 'number' }).notNull().default(0),

    // Metadata from the report for display / filtering.
    technicianBusinessUnit: text('technician_business_unit'),
    technicianTrade: text('technician_trade'),

    sourceReportId: text('source_report_id').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('tech_period_uniq').on(
      t.roleCode,
      t.periodStart,
      t.periodEnd,
      t.employeeId,
    ),
    roleIdx: index('tech_period_role_idx').on(t.roleCode),
    periodIdx: index('tech_period_period_idx').on(t.periodStart, t.periodEnd),
  }),
);

/** Membership daily — per-tier state. */
export const membershipDaily = pgTable(
  'membership_daily',
  {
    id: serial('id').primaryKey(),
    membershipName: text('membership_name').notNull(),
    reportDate: date('report_date').notNull(),

    activeEnd: integer('active_end').notNull().default(0),
    newSales: integer('new_sales').notNull().default(0),
    canceled: integer('canceled').notNull().default(0),
    netChange: integer('net_change').notNull().default(0),
    priceCents: integer('price_cents'),

    sourceReportId: text('source_report_id').notNull(),
    syncedAt: timestamp('synced_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('mem_daily_uniq').on(t.membershipName, t.reportDate),
    dateIdx: index('mem_daily_date_idx').on(t.reportDate),
  }),
);
