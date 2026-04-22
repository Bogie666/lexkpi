'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { Panel } from '@/components/primitives/panel';
import { SectionHead } from '@/components/primitives/section-head';
import { Button } from '@/components/primitives/button';
import { Field, Input, Select } from '@/components/primitives/input';
import { Pill } from '@/components/primitives/pill';
import { Skeleton } from '@/components/primitives/skeleton';
import { fmtMoney } from '@/lib/format/money';
import { fmtPercent } from '@/lib/format/percent';
import {
  useTargetDelete,
  useTargetUpsert,
  useTargetsList,
  type TargetRow,
  type TargetUpsertInput,
} from '@/lib/hooks/use-admin-targets';

const DEPT_CODES = [
  { code: 'hvac_service', name: 'HVAC Service' },
  { code: 'hvac_sales', name: 'HVAC Sales' },
  { code: 'hvac_maintenance', name: 'HVAC Maintenance' },
  { code: 'plumbing', name: 'Plumbing' },
  { code: 'commercial', name: 'Commercial' },
  { code: 'electrical', name: 'Electrical' },
  { code: 'etx', name: 'ETX' },
];

const METRICS = [
  { value: 'revenue', label: 'Revenue', unit: 'cents' as const },
  { value: 'close_rate', label: 'Close rate', unit: 'bps' as const },
  { value: 'avg_ticket', label: 'Avg ticket', unit: 'cents' as const },
  { value: 'opportunities', label: 'Opportunities', unit: 'count' as const },
  { value: 'memberships', label: 'Memberships', unit: 'count' as const },
];

function metricInfo(metric: string) {
  return METRICS.find((m) => m.value === metric) ?? { value: metric, label: metric, unit: 'count' as const };
}

function formatTargetValue(row: TargetRow | { targetValue: number; unit: TargetRow['unit'] }): string {
  if (row.unit === 'cents') return fmtMoney(row.targetValue);
  if (row.unit === 'bps') return fmtPercent(row.targetValue);
  return row.targetValue.toLocaleString('en-US');
}

function scopeLabel(row: Pick<TargetRow, 'scope' | 'scopeValue'>): string {
  if (row.scope === 'company') return 'Company-wide';
  const match = DEPT_CODES.find((d) => d.code === row.scopeValue);
  return match?.name ?? row.scopeValue ?? row.scope;
}

function fmtDateRange(from: string, to: string): string {
  return `${from} → ${to}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}
function monthKeyOf(date: string): string {
  return date.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function compareRowsInMonth(a: TargetRow, b: TargetRow): number {
  // Company first, then departments alphabetically, then other scopes
  const scopeOrder = { company: 0, department: 1, role: 2, employee: 3 } as const;
  if (scopeOrder[a.scope] !== scopeOrder[b.scope]) {
    return scopeOrder[a.scope] - scopeOrder[b.scope];
  }
  if ((a.scopeValue ?? '') !== (b.scopeValue ?? '')) {
    return (a.scopeValue ?? '').localeCompare(b.scopeValue ?? '');
  }
  return a.metric.localeCompare(b.metric);
}

export function TargetsClient() {
  const { data, isLoading, error, refetch } = useTargetsList();
  const upsert = useTargetUpsert();
  const del = useTargetDelete();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Years actually represented in the data, plus the current year so new
  // targets have somewhere to land.
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(new Date().getUTCFullYear());
    (data ?? []).forEach((r) => {
      set.add(yearOf(r.effectiveFrom));
      set.add(yearOf(r.effectiveTo));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [data]);

  // Default to current year on first load (or most-recent with data).
  const activeYear = selectedYear ?? availableYears[0] ?? new Date().getUTCFullYear();

  // Bucket the filtered rows by month key, within the selected year.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, TargetRow[]>();
    (data ?? []).forEach((r) => {
      if (yearOf(r.effectiveFrom) !== activeYear) return;
      const key = monthKeyOf(r.effectiveFrom);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
    // Sort each month's rows
    groups.forEach((rows) => rows.sort(compareRowsInMonth));
    // Return sorted by month descending (newest first)
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data, activeYear]);

  const totalInYear = monthGroups.reduce((sum, [, rows]) => sum + rows.length, 0);

  const notify = (kind: 'success' | 'error', msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  };

  const onSave = async (input: TargetUpsertInput) => {
    try {
      await upsert.mutateAsync(input);
      notify('success', 'Saved');
      setEditingId(null);
      setShowAdd(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm('Delete this target?')) return;
    try {
      await del.mutateAsync(id);
      notify('success', 'Deleted');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Admin"
        title="Targets"
        right={
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setShowAdd(true);
              setEditingId(null);
            }}
          >
            <Plus className="h-4 w-4" />
            New target
          </Button>
        }
      />

      {showAdd && (
        <Panel title="New target" eyebrow="Add" padding="cozy">
          <TargetForm
            mode="create"
            onCancel={() => setShowAdd(false)}
            onSave={onSave}
            busy={upsert.isPending}
          />
        </Panel>
      )}

      {isLoading && (
        <Panel padding="cozy">
          <Skeleton variant="table-row" count={4} className="mb-2" />
        </Panel>
      )}

      {error && !isLoading && (
        <Panel>
          <div className="flex flex-col items-start gap-3">
            <div className="text-panel">Couldn&apos;t load targets</div>
            <p className="text-[13px] text-muted">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        </Panel>
      )}

      {data && (
        <>
          <YearTabs
            years={availableYears}
            active={activeYear}
            onChange={setSelectedYear}
          />

          {monthGroups.length === 0 ? (
            <Panel padding="cozy">
              <div className="py-8 text-center text-[13px] text-muted">
                No targets set for {activeYear} yet.
              </div>
            </Panel>
          ) : (
            <div className="flex flex-col gap-4">
              {monthGroups.map(([monthKey, rows]) => (
                <Panel
                  key={monthKey}
                  eyebrow={`${rows.length} target${rows.length === 1 ? '' : 's'}`}
                  title={monthLabel(monthKey)}
                  padding="cozy"
                  right={
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowAdd(true);
                        setEditingId(null);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  }
                >
                  <div className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="col-head border-b border-border">
                          <th className="py-2 pr-4 font-normal">Scope</th>
                          <th className="py-2 pr-4 font-normal">Metric</th>
                          <th className="py-2 pr-4 font-normal hidden lg:table-cell">Window</th>
                          <th className="py-2 pr-4 font-normal text-right">Target</th>
                          <th className="py-2 pr-2 font-normal text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) =>
                          editingId === row.id ? (
                            <tr key={row.id} className="border-b border-border/60">
                              <td colSpan={5} className="py-4">
                                <TargetForm
                                  mode="edit"
                                  initial={row}
                                  onCancel={() => setEditingId(null)}
                                  onSave={onSave}
                                  busy={upsert.isPending}
                                />
                              </td>
                            </tr>
                          ) : (
                            <tr
                              key={row.id}
                              className="border-b border-border/60 last:border-0 hover:bg-surface-2/20 transition-colors"
                            >
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  {row.scope === 'company' ? (
                                    <Pill tone="accent" size="sm">
                                      Company
                                    </Pill>
                                  ) : (
                                    <span
                                      aria-hidden="true"
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{
                                        background:
                                          row.scope === 'department' && row.scopeValue
                                            ? `var(--d-${row.scopeValue})`
                                            : 'var(--muted)',
                                      }}
                                    />
                                  )}
                                  <span className="text-[13px] font-medium">{scopeLabel(row)}</span>
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-[13px]">{metricInfo(row.metric).label}</td>
                              <td className="py-3 pr-4 hidden lg:table-cell text-[12px] text-muted font-mono tabular-nums">
                                {fmtDateRange(row.effectiveFrom, row.effectiveTo)}
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-medium">
                                {formatTargetValue(row)}
                              </td>
                              <td className="py-3 pr-2 text-right">
                                <div className="inline-flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => setEditingId(row.id)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="danger" onClick={() => onDelete(row.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          <div className="text-[11px] text-muted font-mono tabular-nums text-right">
            {totalInYear} target{totalInYear === 1 ? '' : 's'} in {activeYear} · {data.length} total
          </div>
        </>
      )}

      {toast && (
        <div
          className="fixed bottom-4 left-4 z-50 bg-surface border border-border rounded-panel px-4 py-2.5 text-[13px] shadow-[var(--shadow-modal)]"
          style={{ color: toast.kind === 'success' ? 'var(--up)' : 'var(--down)' }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Year selector ──────────────────────────────────────────────────────────

function YearTabs({
  years,
  active,
  onChange,
}: {
  years: number[];
  active: number;
  onChange: (y: number) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Year"
      className="inline-flex items-center gap-0.5 p-1 bg-surface border border-border rounded-btn self-start"
    >
      {years.map((y) => {
        const isActive = y === active;
        return (
          <button
            key={y}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(y)}
            className={
              'text-[12px] font-mono tabular-nums font-medium px-3 py-1 rounded-[6px] transition-colors ' +
              (isActive
                ? 'bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]'
                : 'text-muted hover:text-text hover:bg-surface-2/40')
            }
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}

// ─── Form ───────────────────────────────────────────────────────────────────

interface TargetFormProps {
  mode: 'create' | 'edit';
  initial?: TargetRow;
  onCancel: () => void;
  onSave: (input: TargetUpsertInput) => Promise<void>;
  busy: boolean;
}

function TargetForm({ mode, initial, onCancel, onSave, busy }: TargetFormProps) {
  const [metric, setMetric] = useState(initial?.metric ?? 'revenue');
  const [scope, setScope] = useState<TargetRow['scope']>(initial?.scope ?? 'department');
  const [scopeValue, setScopeValue] = useState<string | null>(initial?.scopeValue ?? 'hvac_service');
  const [effectiveFrom, setEffectiveFrom] = useState(initial?.effectiveFrom ?? defaultFromDate());
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? defaultToDate());
  const [displayValue, setDisplayValue] = useState(
    initial ? displayFromTargetValue(initial.targetValue, initial.unit) : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const metricUnit = metricInfo(metric).unit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseDisplayValue(displayValue, metricUnit);
    if (parsed === null) return;
    await onSave({
      metric,
      scope,
      scopeValue: scope === 'company' ? null : scopeValue,
      effectiveFrom,
      effectiveTo,
      targetValue: parsed,
      unit: metricUnit,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Metric">
          <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Scope">
          <Select
            value={scope}
            onChange={(e) => {
              const next = e.target.value as TargetRow['scope'];
              setScope(next);
              if (next === 'company') setScopeValue(null);
              else if (scopeValue === null) setScopeValue('hvac_service');
            }}
          >
            <option value="company">Company-wide</option>
            <option value="department">Department</option>
          </Select>
        </Field>

        {scope !== 'company' && (
          <Field label="Department">
            <Select
              value={scopeValue ?? ''}
              onChange={(e) => setScopeValue(e.target.value)}
            >
              {DEPT_CODES.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Effective from">
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            required
          />
        </Field>

        <Field label="Effective to">
          <Input
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
            required
          />
        </Field>

        <Field
          label="Target"
          hint={
            metricUnit === 'cents'
              ? 'Dollars — e.g. 2180000 for $2.18M'
              : metricUnit === 'bps'
                ? 'Percent — e.g. 42.8 for 42.8%'
                : 'Count — e.g. 8412'
          }
        >
          <Input
            type="number"
            step="any"
            placeholder={metricUnit === 'cents' ? '2180000' : metricUnit === 'bps' ? '42.8' : '1000'}
            value={displayValue}
            onChange={(e) => setDisplayValue(e.target.value)}
            required
          />
        </Field>

        <Field label="Notes (optional)" className="md:col-span-2 lg:col-span-3">
          <Input
            value={notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context for this target"
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          <Save className="h-4 w-4" />
          {mode === 'create' ? 'Create' : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function defaultFromDate(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function defaultToDate(): string {
  const d = new Date();
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return last.toISOString().slice(0, 10);
}

/** Convert the user-typed display value into the canonical stored unit. */
function parseDisplayValue(raw: string, unit: TargetRow['unit']): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (unit === 'cents') return Math.round(n * 100);
  if (unit === 'bps') return Math.round(n * 100);
  return Math.round(n);
}

/** Convert a stored value to the friendly display form for editing. */
function displayFromTargetValue(value: number, unit: TargetRow['unit']): string {
  if (unit === 'cents') return (value / 100).toString();
  if (unit === 'bps') return (value / 100).toString();
  return value.toString();
}
