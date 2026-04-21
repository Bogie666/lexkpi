'use client';

import { Panel } from '@/components/primitives/panel';
import { SectionHead } from '@/components/primitives/section-head';

export interface PlaceholderViewProps {
  title: string;
  description?: string;
}

export function PlaceholderView({ title, description }: PlaceholderViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionHead eyebrow="Coming soon" title={title} />
      <Panel padding="cozy">
        <div className="flex flex-col items-start gap-3 py-8">
          <div className="text-panel">Not yet ported</div>
          <p className="text-[13px] text-muted max-w-lg leading-relaxed">
            {description ??
              'This view exists in the design spec and will be built next. The shell, routing, and design system are wired up — drop the components in here and they will render.'}
          </p>
        </div>
      </Panel>
    </div>
  );
}
