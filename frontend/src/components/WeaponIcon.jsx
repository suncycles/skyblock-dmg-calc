import { useEffect, useState } from 'react';
import { getWeaponIcon, getSkyblockIcon, FALLBACK_ICON } from '../lib/icons';

// Tries the item's bespoke SkyBlock texture first (if it has an id and one
// exists in the Hypixel resource pack subset we bundled), then the generic
// vanilla-material icon, then the inline placeholder — in that order.
function buildCandidates(id, material) {
  const candidates = [];
  const skyblockIcon = getSkyblockIcon(id);
  if (skyblockIcon) candidates.push(skyblockIcon);
  candidates.push(getWeaponIcon(material));
  candidates.push(FALLBACK_ICON);
  return candidates;
}

export default function WeaponIcon({ id, material, alt, className }) {
  const [candidates, setCandidates] = useState(() => buildCandidates(id, material));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setCandidates(buildCandidates(id, material));
    setIndex(0);
  }, [id, material]);

  return (
    <img
      src={candidates[index]}
      alt={alt}
      className={className}
      onError={() => setIndex((i) => Math.min(i + 1, candidates.length - 1))}
    />
  );
}
