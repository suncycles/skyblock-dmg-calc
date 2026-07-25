import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBuild } from '../context/BuildContext';
import { useItemData } from '../context/ItemDataContext';
import { decodeLoadoutCode } from '../lib/loadoutCode';

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
        <>
          <div className="text-sm text-red-400 mb-3">{error}</div>
          <button
            className="text-sm px-3 py-1.5 cursor-pointer bg-neutral-800 text-white hover:brightness-110"
            onClick={() => navigate('/')}
          >
            Go home
          </button>
        </>
      ) : (
        <div className="text-sm text-neutral-300">Loading loadout...</div>
      )}
    </div>
  );
}
