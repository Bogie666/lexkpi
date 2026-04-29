'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TvScene } from './scenes/tv-scene';
import { FinancialScene } from './scenes/financial-scene';
import { LeaderboardScene } from './scenes/leaderboard-scene';
import { CallCenterScene } from './scenes/call-center-scene';
import { MembershipsScene } from './scenes/memberships-scene';
import { AppointmentsScene } from './scenes/appointments-scene';

interface SceneEntry {
  id: string;
  durationSec: number;
  render: () => React.ReactNode;
}

/**
 * Hardcoded shared playlist. v1 is single-layout — every TV cycles
 * through the same scenes. If we want per-TV configs later, swap
 * this array for a server-fetched playlist keyed by token.
 */
const PLAYLIST: SceneEntry[] = [
  { id: 'financial-mtd', durationSec: 25, render: () => <FinancialScene /> },
  { id: 'tech-comfort_advisor', durationSec: 22, render: () => <LeaderboardScene roleCode="comfort_advisor" /> },
  { id: 'tech-hvac_tech', durationSec: 22, render: () => <LeaderboardScene roleCode="hvac_tech" /> },
  { id: 'tech-hvac_maintenance', durationSec: 22, render: () => <LeaderboardScene roleCode="hvac_maintenance" /> },
  { id: 'tech-plumbing', durationSec: 22, render: () => <LeaderboardScene roleCode="plumbing" /> },
  { id: 'tech-electrical', durationSec: 22, render: () => <LeaderboardScene roleCode="electrical" /> },
  { id: 'tech-commercial_hvac', durationSec: 22, render: () => <LeaderboardScene roleCode="commercial_hvac" /> },
  { id: 'callcenter', durationSec: 22, render: () => <CallCenterScene /> },
  { id: 'memberships', durationSec: 22, render: () => <MembershipsScene /> },
  { id: 'appointments', durationSec: 22, render: () => <AppointmentsScene /> },
];

export function TvRotator() {
  const [idx, setIdx] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const [progress, setProgress] = useState(0); // 0..1

  const scene = PLAYLIST[idx];

  // Advance to the next scene when this one's duration elapses.
  useEffect(() => {
    startedAtRef.current = Date.now();
    setProgress(0);
    const timer = window.setTimeout(
      () => setIdx((i) => (i + 1) % PLAYLIST.length),
      scene.durationSec * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [idx, scene.durationSec]);

  // Smooth progress bar — animates between scene swaps.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setProgress(Math.min(1, elapsed / scene.durationSec));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [scene.durationSec]);

  // Refresh the page once an hour as a belt-and-suspenders cleanup
  // for any client-state drift, blob caching, or memory bloat from
  // running indefinitely on a kiosk-mode TV.
  useEffect(() => {
    const t = window.setTimeout(() => window.location.reload(), 60 * 60_000);
    return () => window.clearTimeout(t);
  }, []);

  const sceneCount = PLAYLIST.length;
  const segmentWidth = 100 / sceneCount;

  return (
    <div className="relative h-screen w-screen flex flex-col">
      {/* Top progress bar — segmented dots so the operator can tell
          which scene we're on without watching for a full tick. */}
      <div className="absolute top-0 left-0 right-0 h-1 z-20 flex gap-[2px] px-2 pt-2">
        {PLAYLIST.map((s, i) => {
          const fill = i < idx ? 1 : i === idx ? progress : 0;
          return (
            <div
              key={s.id}
              className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden"
              style={{ width: `${segmentWidth}%` }}
            >
              <div
                className="h-full bg-accent transition-[width] duration-100 linear"
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        <TvScene key={scene.id}>{scene.render()}</TvScene>
      </div>
    </div>
  );
}

// Re-export for any external consumers.
export { PLAYLIST };
