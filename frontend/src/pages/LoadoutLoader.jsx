import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { decodeLoadoutCode } from '../lib/loadoutCode';
import { ENTRY_DISMISSED_KEY } from '../lib/entryScreen';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// The share-link entry point: /loadout/:code. Decodes and applies the whole build automatically
// (no confirmation, unlike Landing's Import button). Waits for itemData to finish loading first.
export default function LoadoutLoader() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { loadFullState } = useBuild();
  const { itemData, loading: itemDataLoading } = useItemData();
  const [error, setError] = useState(null);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (itemDataLoading || appliedRef.current) return;
    appliedRef.current = true;
    decodeLoadoutCode(code, itemData)
      .then((state) => {
        loadFullState(state);
        sessionStorage.setItem(ENTRY_DISMISSED_KEY, '1');
        navigate('/', { replace: true });
      })
      .catch((err) => {
        console.error('Failed to load shared loadout:', err);
        setError('This loadout link looks invalid or corrupted.');
      });
  }, [code, itemData, itemDataLoading, loadFullState, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      {error ? (
        <div className={`${panel} p-6 flex flex-col items-center gap-2 max-w-sm`}>
          <span className="text-2xl">⚠️</span>
          <div className="text-sm font-bold text-black">{error}</div>
          <button
            className="mt-1 text-sm px-4 py-2 cursor-pointer bg-neutral-800 text-white hover:brightness-110"
            onClick={() => navigate('/')}
          >
            Go home
          </button>
        </div>
      ) : (
        <div className={`${panel} p-6 flex flex-col items-center gap-2`}>
          <span className="text-2xl animate-pulse">📦</span>
          <div className="text-sm font-bold text-black">Loading loadout...</div>
        </div>
      )}
    </div>
  );
}
