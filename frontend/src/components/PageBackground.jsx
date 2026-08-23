import { useEffect, useMemo } from 'react';
import { useBuild } from '../context/BuildContext';
import { useTheme } from '../context/ThemeContext';
import { getZoneStyle } from '../lib/background';

// Fixed zone-themed backdrop (see lib/background.js) shared by every page, not just Landing —
// keyed off the same Target Mob selection so the whole app stays visually consistent no matter
// which page you're on, and applies the matching GUI theme too. A static (blurred) image rather
// than the video this used to be — no autoplay/decode cost, and no risk of a black border baked
// into old footage ever showing through again.
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
    // The <img> then just fills 100%/100% of THIS already-guaranteed-correct box instead of the
    // viewport directly, so its own sizing can't inherit any of that ambiguity either.
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <img
        key={zoneStyle.image}
        className="w-full h-full object-cover animate-[bg-video-fade-in_600ms_ease-out] brightness-[0.85]"
        src={zoneStyle.image}
        alt=""
      />
    </div>
  );
}
