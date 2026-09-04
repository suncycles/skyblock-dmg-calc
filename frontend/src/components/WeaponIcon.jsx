import { useEffect, useRef, useState } from 'react';
import { getWeaponIcon, getSkyblockIcon, getManualIcon, FALLBACK_ICON } from '../lib/icons';

// Tries a hand-provided override first (images/manual/, for ids the bake pipeline can't
// render), then the item's bespoke SkyBlock texture, then the generic vanilla-material icon,
// then the inline placeholder.
function buildCandidates(id, material) {
  const candidates = [];
  const manualIcon = getManualIcon(id);
  if (manualIcon) candidates.push(manualIcon);
  const skyblockIcon = getSkyblockIcon(id);
  if (skyblockIcon) candidates.push(skyblockIcon);
  candidates.push(getWeaponIcon(material));
  candidates.push(FALLBACK_ICON);
  return candidates;
}

// The bundled leather-armor renders are pre-shaded at Minecraft's default leather
// color (0xA06540 = 160,101,64) rather than a plain white/grey mask — each pixel is
// effectively `shading * defaultColor`. To dye it, divide out the default color to
// recover the per-pixel shading factor, then multiply by the target color. This
// matches vanilla's own leather-armor tint math; a flat CSS blend mode (e.g. overlay)
// on top of this already-brown source produces a muddy, wrong-hued result instead.
const DEFAULT_LEATHER_COLOR = [160, 101, 64];

// Keyed by src+color — the same leather item at the same dye color is tinted often (every grid
// cell showing it, every remount), and the canvas pixel loop is the expensive part, not the fetch.
const tintCache = new Map();

function tintLeatherIcon(src, hexColor) {
  const cacheKey = `${src}|${hexColor}`;
  const cached = tintCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const target = [
      parseInt(hexColor.slice(0, 2), 16),
      parseInt(hexColor.slice(2, 4), 16),
      parseInt(hexColor.slice(4, 6), 16),
    ];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        data[i] = Math.min(255, Math.round((data[i] / DEFAULT_LEATHER_COLOR[0]) * target[0]));
        data[i + 1] = Math.min(255, Math.round((data[i + 1] / DEFAULT_LEATHER_COLOR[1]) * target[1]));
        data[i + 2] = Math.min(255, Math.round((data[i + 2] / DEFAULT_LEATHER_COLOR[2]) * target[2]));
      }
      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL();
      tintCache.set(cacheKey, dataUrl);
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export default function WeaponIcon({ id, material, alt, className, color, style }) {
  const [candidates, setCandidates] = useState(() => buildCandidates(id, material));
  const [index, setIndex] = useState(0);
  const [tintedSrc, setTintedSrc] = useState(null);
  const tintTokenRef = useRef(0);

  useEffect(() => {
    setCandidates(buildCandidates(id, material));
    setIndex(0);
  }, [id, material]);

  const src = candidates[index];

  useEffect(() => {
    if (!color) {
      setTintedSrc(null);
      return;
    }
    const token = ++tintTokenRef.current;
    tintLeatherIcon(src, color)
      .then((dataUrl) => {
        if (tintTokenRef.current === token) setTintedSrc(dataUrl);
      })
      .catch(() => {
        if (tintTokenRef.current === token) setTintedSrc(null);
      });
  }, [src, color]);

  const handleError = () => setIndex((i) => Math.min(i + 1, candidates.length - 1));

  // alt="" (decorative) rather than the item name, and no loading="lazy". Both were actively
  // hurting the grids this renders in: every cell already carries the item's name as a visible
  // label or a hover tooltip, so the alt text added nothing — but until the icon finished
  // loading the browser painted that text *inside* the cell, on top of the real label ("Skeletc"
  // overlapping "Chestplate"). lazy-loading made it worse by deferring icons that are the
  // primary above-the-fold content of every picker and the loadout grid. No native title either
  // — the app's own tooltip (TooltipContext) already owns hover on every surface this appears on.
  return (
    <img src={color ? tintedSrc || src : src} alt="" className={className} style={style} onError={handleError} />
  );
}
