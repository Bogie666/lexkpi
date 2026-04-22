import { pgTable, serial, text, boolean, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Consolidated departments — the dashboard's canonical department list.
 * Maps ~26 ServiceTitan business units down to a manageable set. The `code`
 * column is referenced by every fact table.
 */
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  colorToken: text('color_token').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Technician roles — powers the Technicians tab sub-tabs. */
export const technicianRoles = pgTable('technician_roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** Column the role is primarily sorted/ranked by: 'revenue' | 'avgTicket' | 'jobs' | 'closeRate'. */
  primaryMetric: text('primary_metric').notNull(),
  primaryMetricLabel: text('primary_metric_label').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Employees — canonical roster, referenced by technician_daily + call_center_daily. */
export const employees = pgTable(
  'employees',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    roleCode: text('role_code'),
    departmentCode: text('department_code'),
    active: boolean('active').notNull().default(true),
    photoUrl: text('photo_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    nameUniq: uniqueIndex('employees_name_uniq').on(t.normalizedName),
  }),
);

/** Membership tier metadata — price, color, display order. Populated once. */
export const membershipTiers = pgTable('membership_tiers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  priceCents: integer('price_cents').notNull(),
  colorToken: text('color_token').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

/**
 * ServiceTitan Business Unit dimension — the raw resource endpoints return
 * `businessUnit.id` (numeric, stable). We map ST IDs to our internal dept
 * codes here. `departmentCode = null` means "drop this BU" (e.g. ETX, Service
 * Star) — keeping the row makes explicit-drop intent auditable.
 */
export const businessUnits = pgTable('business_units', {
  id: integer('id').primaryKey(),              // ST's numeric business unit ID
  name: text('name').notNull(),                // ST-provided display name
  departmentCode: text('department_code'),     // null = drop
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
