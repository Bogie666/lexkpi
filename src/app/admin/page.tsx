import Link from 'next/link';
import { Panel } from '@/components/primitives/panel';
import { SectionHead } from '@/components/primitives/section-head';

interface AdminSection {
  href: string;
  title: string;
  description: string;
  status: 'ready' | 'pending';
}

const SECTIONS: AdminSection[] = [
  {
    href: '/admin/targets',
    title: 'Targets',
    description:
      'Edit revenue / close rate / membership goals for departments and company-wide. Period-flexible — set any date range.',
    status: 'ready',
  },
  {
    href: '/admin/photos',
    title: 'Technician photos',
    description:
      'Upload a photo per technician. Replaces the initials circle on every leaderboard, podium, and ranking. Stored in Vercel Blob.',
    status: 'ready',
  },
  {
    href: '/admin/sync',
    title: 'Sync status',
    description:
      'Last sync per source, manual trigger, backfill runs. Pending — still a TODO for the admin UI.',
    status: 'pending',
  },
  {
    href: '/admin/business-units',
    title: 'Business Units',
    description:
      'Map ServiceTitan BU ids to dashboard departments. Currently seeded; full editor pending.',
    status: 'pending',
  },
  {
    href: '/admin/users',
    title: 'Users',
    description: 'Dashboard users + roles. Pending — blocked by auth.',
    status: 'pending',
  },
  {
    href: '/tv',
    title: 'TV display',
    description:
      'Open in Chrome kiosk on any office TV. Cycles through revenue, leaderboards by role, call center, memberships, and upcoming appointments. Auto-refreshes every 5 min and reloads hourly.',
    status: 'ready',
  },
];

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHead eyebrow="Admin" title="Operational config" />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.status === 'ready' ? s.href : '#'}
            className={
              s.status === 'pending'
                ? 'cursor-not-allowed'
                : 'transition-transform hover:-translate-y-[1px]'
            }
            aria-disabled={s.status === 'pending'}
          >
            <Panel
              eyebrow={s.status === 'pending' ? 'Pending' : 'Ready'}
              title={s.title}
              padding="cozy"
              className={
                s.status === 'pending'
                  ? 'opacity-55'
                  : 'hover:border-accent/60 transition-colors'
              }
            >
              <p className="text-[13px] text-muted leading-relaxed">{s.description}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
