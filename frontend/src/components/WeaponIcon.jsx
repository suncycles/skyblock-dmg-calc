import { useEffect, useState } from 'react';
import { getWeaponIcon, getSkyblockIcon, FALLBACK_ICON } from '../lib/icons';

// Tries the item's bespoke SkyBlock texture first, then the generic vanilla-material icon, then the inline placeholder.
function buildCandidates(id, material) {
  const candidates = [];
  const skyblockIcon = getSkyblockIcon(id);
  if (skyblockIcon) candidates.push(skyblockIcon);
  candidates.push(getWeaponIcon(material));
  candidates.push(FALLBACK_ICON);
  return candidates;
}

export default function WeaponIcon({ id, material, alt, className, color }) {
  const [candidates, setCandidates] = useState(() => buildCandidates(id, material));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setCandidates(buildCandidates(id, material));
    setIndex(0);
  }, [id, material]);

  const handleError = () => setIndex((i) => Math.min(i + 1, candidates.length - 1));

  if (!color) {
    return <img src={candidates[index]} alt={alt} className={className} onError={handleError} />;
  }

  // Leather armor's real dye color (baked into the item's NBT, see armor.json's `color`
  // field) — tinted here since the bundled Hypixel resource-pack art has no per-item
  // pre-colored render for these, only the generic undyed base texture.
  return (
    <div className={`relative ${className}`}>
      <img
        src={candidates[index]}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain pixelated"
        onError={handleError}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: `#${color}`, mixBlendMode: 'overlay' }} />
    </div>
  );
}
