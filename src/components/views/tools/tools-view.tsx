import { ExternalLink } from 'lucide-react';
import { SectionHead } from '@/components/primitives/section-head';
import { Pill } from '@/components/primitives/pill';
import { cn } from '@/lib/cn';

interface Tool {
  id: string;
  title: string;
  sub: string;
  status: 'Ready' | 'Scheduled' | 'Admin';
  href?: string;
}

const TOOLS: Tool[] = [
  { id: 'unsold_estimates',  title: 'Unsold Estimates Processor', sub: 'Process open estimates and export Excel for follow-up.', status: 'Ready' },
  { id: 'email_signature',   title: 'Email Signature Generator',  sub: 'Build branded signatures for employees.', status: 'Ready' },
  { id: 'seer_savings',      title: 'SEER Savings Calculator',    sub: 'Estimate customer energy savings from HVAC upgrades.', status: 'Ready' },
  { id: 'photo_manager',     title: 'Technician Photo Manager',   sub: 'Upload and manage tech headshots used on widgets.', status: 'Ready' },
  { id: 'competition_admin', title: 'Competition Admin',          sub: 'Configure seasonal leaderboard competitions.', status: 'Admin' },
  { id: 'review_sync',       title: 'Review Sync',                sub: 'Force-sync Google reviews for all locations.', status: 'Scheduled' },
];

const STATUS_TONE: Record<Tool['status'], 'up' | 'warning' | 'accent'> = {
  Ready: 'up',
  Scheduled: 'warning',
  Admin: 'accent',
};

export function ToolsView() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHead eyebrow="Tools" title="Utilities & admin" />

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {TOOLS.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const disabled = !tool.href;
  return (
    <article
      className={cn(
        'flex flex-col gap-3 p-5 rounded-card bg-surface border border-border',
        'transition-all duration-150',
        'hover:border-accent/60 hover:-translate-y-[1px]',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-[14px] font-semibold leading-tight">{tool.title}</h3>
        <Pill tone={STATUS_TONE[tool.status]} size="sm">
          {tool.status}
        </Pill>
      </header>
      <p className="text-[13px] text-muted leading-relaxed flex-1">{tool.sub}</p>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'self-start inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-btn transition-colors',
          disabled
            ? 'border border-border text-muted cursor-not-allowed'
            : 'border border-border hover:border-accent hover:text-accent',
        )}
      >
        Open
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </article>
  );
}
