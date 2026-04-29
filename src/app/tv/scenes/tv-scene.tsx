'use client';

import type { ReactNode } from 'react';

/**
 * Wrapper for every TV scene. Provides a consistent fade-in animation,
 * full-bleed sizing, and a header band for the scene's eyebrow / title.
 */
export interface TvSceneProps {
  children: ReactNode;
}

export function TvScene({ children }: TvSceneProps) {
  return (
    <div className="h-full w-full px-8 py-6 md:px-12 md:py-10 flex flex-col tv-fade-in">
      {children}
      <style>{`
        .tv-fade-in { animation: tvFade 600ms ease-out both; }
        @keyframes tvFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
