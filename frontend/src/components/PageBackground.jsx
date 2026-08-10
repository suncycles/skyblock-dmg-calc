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
    // Outer wrapper is a plain (non-replaced) box pinned via inset-0 alone, with no width/height
    // of its own — that's the one sizing technique with zero cross-browser ambiguity for a fixed
    // element (unlike a percentage or vw/vh width, which resolve against the initial containing
    // block and have historically been inconsistent across browsers/scrollbar configurations).
    // The <video> then just fills 100%/100% of THIS already-guaranteed-correct box instead of the
    // viewport directly, so its own sizing can't inherit any of that ambiguity either.
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <video
        key={zoneStyle.video}
        className="w-full h-full object-cover animate-[bg-video-fade-in_600ms_ease-out]"
        src={zoneStyle.video}
        autoPlay
        loop
        muted
        playsInline
      />
    </div>
  );
}
