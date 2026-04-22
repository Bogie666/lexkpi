import Link from 'next/link';
import { LiveDot } from '@/components/primitives/live-dot';
import { AdminAuthGate } from '@/components/admin/admin-auth-gate';

export const dynamic = 'force-dynamic';

/**
 * Minimal admin shell. Top bar + "gate" that requires the shared admin
 * secret (temporary, until Auth.js). Every /admin/* route inherits this.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header
        className="sticky top-0 z-10 border-b border-border backdrop-blur-[12px] bg-[color:var(--nav-bg)]"
      >
        <div className="flex items-center gap-4 px-4 md:px-[var(--density-pad-x)] h-14 md:h-16">
          <Link href="/admin" className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="h-7 w-7 rounded-md"
              style={{
                background:
                  'linear-gradient(135deg, var(--accent) 0%, color-mix(in oklch, var(--accent) 70%, var(--d-commercial)) 100%)',
              }}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] font-semibold tracking-tight">Lex KPI Admin</span>
              <span className="text-[11px] text-muted hidden sm:inline">
                Operational config
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1 ml-2 overflow-x-auto no-scrollbar">
            <AdminNavLink href="/admin">Home</AdminNavLink>
            <AdminNavLink href="/admin/targets">Targets</AdminNavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              className="text-[12px] text-muted hover:text-text transition-colors"
            >
              ← Dashboard
            </Link>
            <div className="hidden md:block">
              <LiveDot size="sm" />
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 md:px-[var(--density-pad-x)] py-6 md:py-[var(--density-pad-y)]">
        <AdminAuthGate>{children}</AdminAuthGate>
      </main>
    </div>
  );
}

function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[12px] font-medium px-2.5 py-1 rounded-btn text-muted hover:text-text hover:bg-surface-2/60 transition-colors whitespace-nowrap"
    >
      {children}
    </Link>
  );
}
