import { TvRotator } from './tv-rotator';

export const dynamic = 'force-dynamic';

/**
 * Office TV display. Cycles through a fixed playlist of panels with
 * auto-refreshing data. No interaction; safe to leave on a screen
 * indefinitely. Open this URL once on each TV (Chrome kiosk mode is
 * a good fit) and it'll just keep ticking.
 */
export default function TvPage() {
  return <TvRotator />;
}
