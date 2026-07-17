import { useEffect, useState } from 'react';
import { getWeaponIcon, FALLBACK_ICON } from '../lib/icons';

export default function WeaponIcon({ material, alt, className }) {
  const [src, setSrc] = useState(() => getWeaponIcon(material));

  useEffect(() => {
    setSrc(getWeaponIcon(material));
  }, [material]);

  return <img src={src} alt={alt} className={className} onError={() => setSrc(FALLBACK_ICON)} />;
}
