CREATE TABLE "business_units" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"department_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color_token" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"role_code" text,
	"department_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"color_token" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "membership_tiers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "technician_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"primary_metric" text NOT NULL,
	"primary_metric_label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "technician_roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "call_center_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_name" text NOT NULL,
	"report_date" date NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"calls_booked" integer DEFAULT 0 NOT NULL,
	"booking_rate_bps" integer,
	"avg_wait_sec" integer,
	"abandon_rate_bps" integer,
	"source_report_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_center_hourly" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_date" date NOT NULL,
	"hour" integer NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"calls_booked" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"estimate_id" text NOT NULL,
	"opportunity_status" text NOT NULL,
	"sold_on" date,
	"created_on" date NOT NULL,
	"subtotal_cents" bigint DEFAULT 0 NOT NULL,
	"department_code" text,
	"time_to_close_days" integer,
	"tier_selected" text,
	"source_report_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "estimate_analysis_estimate_id_unique" UNIQUE("estimate_id")
);
--> statement-breakpoint
CREATE TABLE "financial_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_code" text NOT NULL,
	"report_date" date NOT NULL,
	"total_revenue_cents" bigint DEFAULT 0 NOT NULL,
	"jobs" integer DEFAULT 0 NOT NULL,
	"opportunities" integer DEFAULT 0 NOT NULL,
	"source_report_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"membership_name" text NOT NULL,
	"report_date" date NOT NULL,
	"active_end" integer DEFAULT 0 NOT NULL,
	"new_sales" integer DEFAULT 0 NOT NULL,
	"canceled" integer DEFAULT 0 NOT NULL,
	"net_change" integer DEFAULT 0 NOT NULL,
	"price_cents" integer,
	"source_report_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"employee_name" text NOT NULL,
	"role_code" text NOT NULL,
	"department_code" text,
	"report_date" date NOT NULL,
	"revenue_cents" bigint DEFAULT 0 NOT NULL,
	"jobs_completed" integer DEFAULT 0 NOT NULL,
	"close_rate_bps" integer,
	"recall_rate_bps" integer,
	"avg_ticket_cents" bigint,
	"memberships" integer DEFAULT 0 NOT NULL,
	"leads_set" integer DEFAULT 0 NOT NULL,
	"opportunities" integer DEFAULT 0 NOT NULL,
	"source_report_id" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric" text NOT NULL,
	"scope" text NOT NULL,
	"scope_value" text,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"target_value" bigint NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trigger" text NOT NULL,
	"report_id" text,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"status" text NOT NULL,
	"rows_fetched" integer,
	"rows_upserted" integer,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "employees_name_uniq" ON "employees" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "cc_daily_uniq" ON "call_center_daily" USING btree ("employee_name","report_date");--> statement-breakpoint
CREATE INDEX "cc_daily_date_idx" ON "call_center_daily" USING btree ("report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cc_hourly_uniq" ON "call_center_hourly" USING btree ("report_date","hour");--> statement-breakpoint
CREATE INDEX "cc_hourly_date_idx" ON "call_center_hourly" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "ea_created_idx" ON "estimate_analysis" USING btree ("created_on");--> statement-breakpoint
CREATE INDEX "ea_status_idx" ON "estimate_analysis" USING btree ("opportunity_status");--> statement-breakpoint
CREATE INDEX "ea_dept_idx" ON "estimate_analysis" USING btree ("department_code");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_daily_uniq" ON "financial_daily" USING btree ("department_code","report_date");--> statement-breakpoint
CREATE INDEX "fin_daily_date_idx" ON "financial_daily" USING btree ("report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "mem_daily_uniq" ON "membership_daily" USING btree ("membership_name","report_date");--> statement-breakpoint
CREATE INDEX "mem_daily_date_idx" ON "membership_daily" USING btree ("report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tech_daily_uniq" ON "technician_daily" USING btree ("employee_id","report_date","role_code");--> statement-breakpoint
CREATE INDEX "tech_daily_date_idx" ON "technician_daily" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "tech_daily_dept_date" ON "technician_daily" USING btree ("department_code","report_date");--> statement-breakpoint
CREATE INDEX "tech_daily_role_date" ON "technician_daily" USING btree ("role_code","report_date");--> statement-breakpoint
CREATE INDEX "targets_lookup" ON "targets" USING btree ("metric","scope","scope_value","effective_from");--> statement-breakpoint
CREATE INDEX "sync_runs_source_started_idx" ON "sync_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_status_idx" ON "sync_runs" USING btree ("status");