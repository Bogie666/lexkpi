'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, Save, X, Copy } from 'lucide-react';
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

// ─── Constants ──────────────────────────────────────────────────────────────

const DEPT_CODES: Array<{ code: string; name: string }> = [
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function metricInfo(metric: string) {
  return METRICS.find((m) => m.value === metric) ?? { value: metric, label: metric, unit: 'count' as const };
}

function formatTargetValue(value: number, unit: TargetRow['unit']): string {
  if (unit === 'cents') return fmtMoney(value);
  if (unit === 'bps') return fmtPercent(value);
  return value.toLocaleString('en-US');
}

function scopeLabel(row: Pick<TargetRow, 'scope' | 'scopeValue'>): string {
  if (row.scope === 'company') return 'Company-wide';
  const match = DEPT_CODES.find((d) => d.code === row.scopeValue);
  return match?.name ?? row.scopeValue ?? row.scope;
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
function lastOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}
function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isRevenueMonthlyDept(r: TargetRow): boolean {
  return r.metric === 'revenue' && r.scope === 'department';
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function TargetsClient() {
  const { data, isLoading, error, refetch } = useTargetsList();
  const upsert = useTargetUpsert();
  const del = useTargetDelete();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [addingContext, setAddingContext] = useState<{ monthKey: string; dept: string } | null>(
    null,
  );
  const [showFullAdd, setShowFullAdd] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Available years — union of years in data + current year.
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    set.add(new Date().getUTCFullYear());
    (data ?? []).forEach((r) => {
      set.add(Number(r.effectiveFrom.slice(0, 4)));
      set.add(Number(r.effectiveTo.slice(0, 4)));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [data]);

  const activeYear = selectedYear ?? availableYears[0] ?? new Date().getUTCFullYear();

  // Split targets into the monthly-revenue view vs "other" (close_rate, etc.)
  const { monthlyRevByKeyByDept, otherTargets } = useMemo(() => {
    const byMonth = new Map<string, Map<string, TargetRow>>(); // monthKey → dept → row
    const other: TargetRow[] = [];
    (data ?? []).forEach((r) => {
      if (isRevenueMonthlyDept(r)) {
        const key = r.effectiveFrom.slice(0, 7);
        if (!byMonth.has(key)) byMonth.set(key, new Map());
        byMonth.get(key)!.set(r.scopeValue ?? '', r);
      } else {
        other.push(r);
      }
    });
    return { monthlyRevByKeyByDept: byMonth, otherTargets: other };
  }, [data]);

  // 12 months of the active year.
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        year: activeYear,
        month: i + 1,
        key: monthKey(activeYear, i + 1),
        label: `${MONTH_NAMES[i]} ${activeYear}`,
      })),
    [activeYear],
  );

  const notify = (kind: 'success' | 'error', msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  };

  const onSave = async (input: TargetUpsertInput) => {
    try {
      await upsert.mutateAsync(input);
      notify('success', 'Saved');
      setEditingId(null);
      setAddingContext(null);
      setShowFullAdd(false);
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

  // Bulk copy previous month's dept targets into this month.
  const onCopyFromPrevious = async (year: number, month: number) => {
    const prev = previousMonth(year, month);
    const prevMap = monthlyRevByKeyByDept.get(monthKey(prev.year, prev.month));
    if (!prevMap || prevMap.size === 0) {
      notify('error', 'No previous month to copy from');
      return;
    }
    const currentMap = monthlyRevByKeyByDept.get(monthKey(year, month)) ?? new Map();
    const toCreate = Array.from(prevMap.values()).filter(
      (r) => r.scopeValue && !currentMap.has(r.scopeValue),
    );
    if (!toCreate.length) {
      notify('error', 'Nothing to copy (current month already has those depts set)');
      return;
    }
    try {
      for (const row of toCreate) {
        await upsert.mutateAsync({
          metric: 'revenue',
          scope: 'department',
          scopeValue: row.scopeValue,
          effectiveFrom: firstOfMonth(year, month),
          effectiveTo: lastOfMonth(year, month),
          targetValue: row.targetValue,
          unit: row.unit,
          notes: row.notes ?? undefined,
        });
      }
      notify('success', `Copied ${toCreate.length} target${toCreate.length === 1 ? '' : 's'}`);
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
              setShowFullAdd(true);
              setEditingId(null);
              setAddingContext(null);
            }}
          >
            <Plus className="h-4 w-4" />
            New target
          </Button>
        }
      />

      {showFullAdd && (
        <Panel title="New target" eyebrow="Add" padding="cozy">
          <TargetForm
            mode="create"
            onCancel={() => setShowFullAdd(false)}
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
          <div className="flex items-center gap-3 flex-wrap">
            <YearTabs
              years={availableYears}
              active={activeYear}
              onChange={setSelectedYear}
            />
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
              Company targets auto-sum from departments
            </span>
          </div>

          {/* Revenue — one Panel per month */}
          <div className="flex flex-col gap-4">
            {months.map(({ year, month, key, label }) => {
              const deptRows = monthlyRevByKeyByDept.get(key) ?? new Map();
              const total = Array.from(deptRows.values()).reduce(
                (s, r) => s + Number(r.targetValue),
                0,
              );
              const filled = deptRows.size;
              const prev = previousMonth(year, month);
              const prevHasAny = (monthlyRevByKeyByDept.get(monthKey(prev.year, prev.month)) ?? new Map()).size > 0;

              return (
                <Panel
                  key={key}
                  eyebrow={`Company: ${fmtMoney(total)}  ·  ${filled}/${DEPT_CODES.length} filled`}
                  title={label}
                  padding="cozy"
                  right={
                    prevHasAny && filled < DEPT_CODES.length ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCopyFromPrevious(year, month)}
                        disabled={upsert.isPending}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy from {MONTH_NAMES[prev.month - 1].slice(0, 3)} {prev.year}
                      </Button>
                    ) : null
                  }
                >
                  <ul className="flex flex-col divide-y divide-border/60">
                    {DEPT_CODES.map((dept) => {
                      const row = deptRows.get(dept.code);
                      const isAdding =
                        addingContext?.monthKey === key && addingContext?.dept === dept.code;
                      const isEditing = row && editingId === row.id;

                      return (
                        <li key={dept.code} className="flex items-center gap-3 py-3">
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: `var(--d-${dept.code})` }}
                          />
                          <span className="text-[13px] font-medium min-w-0 w-[180px] md:w-[220px]">
                            {dept.name}
                          </span>

                          {isAdding || isEditing ? (
                            <InlineRevenueValue
                              initial={row?.targetValue}
                              onSave={async (cents) => {
                                await onSave({
                                  metric: 'revenue',
                                  scope: 'department',
                                  scopeValue: dept.code,
                                  effectiveFrom: firstOfMonth(year, month),
                                  effectiveTo: lastOfMonth(year, month),
                                  targetValue: cents,
                                  unit: 'cents',
                                });
                              }}
                              onCancel={() => {
                                setEditingId(null);
                                setAddingContext(null);
                              }}
                              busy={upsert.isPending}
                            />
                          ) : row ? (
                            <>
                              <span className="font-mono tabular-nums text-[14px] font-medium flex-1">
                                {fmtMoney(row.targetValue)}
                              </span>
                              <div className="inline-flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingId(row.id);
                                    setAddingContext(null);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => onDelete(row.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="text-[13px] text-muted flex-1">— not set —</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAddingContext({ monthKey: key, dept: dept.code });
                                  setEditingId(null);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add
                              </Button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              );
            })}
          </div>

          {/* Non-revenue targets */}
          {otherTargets.length > 0 && (
            <Panel
              eyebrow={`${otherTargets.length} row${otherTargets.length === 1 ? '' : 's'}`}
              title="Other targets (non-revenue)"
              padding="cozy"
            >
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-left">
                  <thead>
                    <tr className="col-head border-b border-border">
                      <th className="py-2 pr-4 font-normal">Scope</th>
                      <th className="py-2 pr-4 font-normal">Metric</th>
                      <th className="py-2 pr-4 font-normal hidden md:table-cell">Window</th>
                      <th className="py-2 pr-4 font-normal text-right">Target</th>
                      <th className="py-2 pr-2 font-normal text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherTargets.map((row) =>
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
                          <td className="py-3 pr-4 hidden md:table-cell text-[12px] text-muted font-mono tabular-nums">
                            {row.effectiveFrom} → {row.effectiveTo}
                          </td>
                          <td className="py-3 pr-4 text-right font-mono tabular-nums text-[14px] font-medium">
                            {formatTargetValue(row.targetValue, row.unit)}
                          </td>
                          <td className="py-3 pr-2 text-right">
                            <div className="inline-flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingId(row.id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => onDelete(row.id)}
                              >
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
          )}
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

// ─── Inline revenue value input ─────────────────────────────────────────────

function InlineRevenueValue({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial?: number;
  onSave: (cents: number) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(
    initial !== undefined ? (initial / 100).toString() : '',
  );
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = value.replace(/,/g, '').replace(/\$/g, '').trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return;
    void onSave(Math.round(n * 100));
  };
  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1">
      <div className="flex-1 relative">
        <span
          aria-hidden="true"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted pointer-events-none"
        >
          $
        </span>
        <Input
          type="text"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-6"
        />
      </div>
      <Button type="submit" size="sm" variant="primary" disabled={busy}>
        <Save className="h-3.5 w-3.5" />
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </form>
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
      className="inline-flex items-center gap-0.5 p-1 bg-surface border border-border rounded-btn"
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

// ─── Full form (non-revenue / arbitrary targets) ────────────────────────────

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
  const [scopeValue, setScopeValue] = useState<string | null>(
    initial?.scopeValue ?? 'hvac_service',
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    initial?.effectiveFrom ?? defaultFromDate(),
  );
  const [effectiveTo, setEffectiveTo] = useState(initial?.effectiveTo ?? defaultToDate());
  const [displayValue, setDisplayValue] = useState(
    initial ? displayFromTargetValue(initial.targetValue, initial.unit) : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const metricUnit = metricInfo(metric).unit;

  const handleSubmit = async (e: FormEvent) => {
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
            <Select value={scopeValue ?? ''} onChange={(e) => setScopeValue(e.target.value)}>
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
            placeholder={
              metricUnit === 'cents' ? '2180000' : metricUnit === 'bps' ? '42.8' : '1000'
            }
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

function parseDisplayValue(raw: string, unit: TargetRow['unit']): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (unit === 'cents') return Math.round(n * 100);
  if (unit === 'bps') return Math.round(n * 100);
  return Math.round(n);
}

function displayFromTargetValue(value: number, unit: TargetRow['unit']): string {
  if (unit === 'cents') return (value / 100).toString();
  if (unit === 'bps') return (value / 100).toString();
  return value.toString();
}
