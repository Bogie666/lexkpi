'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from '@/components/primitives/panel';
import { Button } from '@/components/primitives/button';
import { SectionHead } from '@/components/primitives/section-head';
import { useAdminSecret } from '@/lib/hooks/use-admin-secret';

interface RosterEntry {
  employeeId: number;
  name: string;
  normalizedName: string;
  roleCode: string;
  photoUrl: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  comfort_advisor: 'Comfort Advisor',
  hvac_tech: 'HVAC Tech',
  hvac_maintenance: 'HVAC Maintenance',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  commercial_hvac: 'Commercial HVAC',
};

export function PhotosClient() {
  const { authHeaders } = useAdminSecret();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchRoster = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/tech-roster', { headers: authHeaders() });
      if (!res.ok) throw new Error(`tech-roster: ${res.status}`);
      const json = (await res.json()) as { ok: boolean; roster: RosterEntry[] };
      setRoster(json.roster);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const visible = useMemo(() => {
    if (!roster) return [];
    const q = search.trim().toLowerCase();
    return roster.filter((r) => {
      if (filter !== 'all' && r.roleCode !== filter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roster, filter, search]);

  const photoCount = useMemo(
    () => (roster ? roster.filter((r) => r.photoUrl).length : 0),
    [roster],
  );

  const roles = useMemo(() => {
    if (!roster) return [];
    const set = new Set<string>();
    roster.forEach((r) => set.add(r.roleCode));
    return Array.from(set).sort();
  }, [roster]);

  const onUpdate = useCallback(
    (norm: string, photoUrl: string | null) => {
      setRoster((prev) =>
        prev ? prev.map((r) => (r.normalizedName === norm ? { ...r, photoUrl } : r)) : prev,
      );
    },
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionHead
        eyebrow="Admin"
        title="Technician photos"
        right={
          roster && (
            <span className="text-meta text-muted font-mono tabular-nums">
              {photoCount} / {roster.length} uploaded
            </span>
          )
        }
      />

      <Panel padding="cozy">
        <p className="text-[13px] text-muted leading-relaxed mb-4">
          Upload a square photo per technician. The image replaces the initials
          circle on every leaderboard, podium, and ranking. JPEG/PNG/WEBP, max
          10 MB. Square images crop best — anything else gets centered with a
          background tint.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="role-filter" className="text-[12px] text-muted">
              Role
            </label>
            <select
              id="role-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="text-[13px] bg-surface-2 border border-border rounded-btn px-2 py-1"
            >
              <option value="all">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="text-[13px] bg-surface-2 border border-border rounded-btn px-2.5 py-1 w-56"
            />
          </div>
        </div>
      </Panel>

      {error && (
        <Panel>
          <div className="text-[13px] text-down">Error: {error}</div>
        </Panel>
      )}

      {!roster && !error && (
        <Panel>
          <div className="text-[13px] text-muted">Loading roster…</div>
        </Panel>
      )}

      {roster && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {visible.map((r) => (
            <PhotoRow key={r.normalizedName} entry={r} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoRow({
  entry,
  onUpdate,
}: {
  entry: RosterEntry;
  onUpdate: (norm: string, photoUrl: string | null) => void;
}) {
  const { authHeaders } = useAdminSecret();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = entry.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      form.append('employeeName', entry.name);
      form.append('roleCode', entry.roleCode);
      const res = await fetch('/api/admin/employee-photo', {
        method: 'POST',
        body: form,
        headers: authHeaders(),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}) as Record<string, unknown>);
        const detail =
          (json.detail as string | undefined) ?? (json.error as string | undefined) ?? '';
        const hint = (json.hint as string | undefined) ?? '';
        throw new Error(
          `${res.status}${detail ? ` — ${detail}` : ''}${hint ? ` (${hint})` : ''}`,
        );
      }
      const json = (await res.json()) as { url: string };
      onUpdate(entry.normalizedName, json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!entry.photoUrl) return;
    if (!confirm(`Remove photo for ${entry.name}?`)) return;
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(
        `/api/admin/employee-photo?employeeName=${encodeURIComponent(entry.name)}`,
        { method: 'DELETE', headers: authHeaders() },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`remove failed: ${res.status} ${text.slice(0, 120)}`);
      }
      onUpdate(entry.normalizedName, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Panel padding="tight">
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 h-14 w-14 rounded-full grid place-items-center overflow-hidden"
          style={{
            background: `var(--d-${entry.roleCode === 'comfort_advisor' ? 'hvac_sales' : entry.roleCode === 'hvac_tech' ? 'hvac_service' : entry.roleCode})`,
            border: '1px solid var(--border)',
          }}
        >
          {entry.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.photoUrl}
              alt={entry.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[13px] font-mono font-medium text-bg">{initials || '?'}</span>
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-medium truncate">{entry.name}</span>
          <span className="text-[11px] text-muted capitalize">
            {ROLE_LABEL[entry.roleCode] ?? entry.roleCode}
          </span>
          {error && <span className="text-[11px] text-down mt-0.5">{error}</span>}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <Button size="sm" onClick={handlePick} disabled={uploading}>
            {uploading ? 'Uploading…' : entry.photoUrl ? 'Replace' : 'Upload'}
          </Button>
          {entry.photoUrl && (
            <Button size="sm" variant="ghost" onClick={handleRemove} disabled={uploading}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
