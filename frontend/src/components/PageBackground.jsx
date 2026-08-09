import { useEffect, useMemo } from 'react';
import { useBuild } from '../context/BuildContext';
import { useTheme } from '../context/ThemeContext';
import { getZoneStyle } from '../lib/background';

// Fixed zone-themed video backdrop (see lib/background.js) shared by every page, not just
// Landing — keyed off the same Target Mob selection so the whole app stays visually consistent
// no matter which page you're on, and applies the matching GUI theme too. `key={video}` forces a
// fresh <video> element on zone change so autoplay reliably restarts (browsers don't always
// resume playback just from an src swap on an existing element).
export default function PageBackground() {
  const { targetMobs } = useBuild();
  const { setTheme } = useTheme();
  const zoneStyle = useMemo(() => getZoneStyle(targetMobs), [targetMobs]);

  useEffect(() => {
    setTheme(zoneStyle.theme);
  }, [zoneStyle.theme, setTheme]);

  return (
    <video
      key={zoneStyle.video}
      // w-full/h-full (not w-screen/h-screen) — 100vw/100vh can render narrower than the true
      // viewport when a vertical scrollbar is present (browsers disagree on whether vw includes
      // the scrollbar gutter), leaving a black gap on the right on wide viewports. A fixed
      // element's percentage width/height resolves against the true viewport with no such
      // ambiguity, so 100%/100% + inset-0 pins it exactly to all four edges.
      className="fixed inset-0 -z-10 w-full h-full object-cover animate-[bg-video-fade-in_600ms_ease-out]"
      src={zoneStyle.video}
      autoPlay
      loop
      muted
      playsInline
    />
  );
}
