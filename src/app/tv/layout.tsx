/**
 * TV display layout — full-bleed, no nav, no cursor. Used by every
 * route under /tv/*. Inherits the root font + theme from app/layout.
 */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-bg text-text overflow-hidden"
      style={{ cursor: 'none' }}
    >
      {children}
    </div>
  );
}
