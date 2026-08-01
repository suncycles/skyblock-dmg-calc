import { useEffect, useMemo } from 'react';
import { useBuild } from '../context/BuildContext';
import { useTheme } from '../context/ThemeContext';
import { getZoneStyle } from '../lib/background';

// Fixed zone-themed backdrop (see lib/background.js) shared by every page, not just Landing —
// keyed off the same Target Mob selection so the whole app stays visually consistent no matter
// which page you're on, and applies the matching GUI theme too.
export default function PageBackground() {
  const { targetMobs } = useBuild();
  const { setTheme } = useTheme();
  const zoneStyle = useMemo(() => getZoneStyle(targetMobs), [targetMobs]);

  useEffect(() => {
    setTheme(zoneStyle.theme);
  }, [zoneStyle.theme, setTheme]);

  return (
    <div
      className="fixed inset-0 -z-10 w-screen h-screen"
      style={{
        backgroundImage: `url(${zoneStyle.background})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
