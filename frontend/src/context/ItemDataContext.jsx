import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const WORKER_BASE_URL = 'https://dmg-calc-cache.mich536ael.workers.dev';

const EMPTY = { weapons: [], armor: [], equipment: [], enchants: {}, lastFetched: null };

const ItemDataContext = createContext(null);

function describeStatus(data) {
  const date = data.lastFetched ? new Date(data.lastFetched).toLocaleString() : 'unknown';
  return `Item data: from shared cache, ${date} (${data.weapons.length} weapons, ${data.armor.length} armor)`;
}

export function ItemDataProvider({ children }) {
  const [itemData, setItemData] = useState(EMPTY);
  const [status, setStatus] = useState('Item data: not loaded');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus('Loading...');
    try {
      const res = await fetch(`${WORKER_BASE_URL}/api/items`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setItemData(data);
      setStatus(describeStatus(data));
    } catch (err) {
      console.error('Failed to load item data:', err);
      setError(err.message);
      setStatus('Item data: fetch failed (see console)');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setStatus('Refreshing...');
    try {
      const res = await fetch(`${WORKER_BASE_URL}/api/refresh`, { method: 'POST' });
      const data = await res.json();
      setItemData(data);
      setStatus(describeStatus(data));
    } catch (err) {
      console.error('Failed to refresh item data:', err);
      setStatus('Item data: refresh failed (see console)');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ItemDataContext.Provider value={{ itemData, status, loading, error, refresh }}>
      {children}
    </ItemDataContext.Provider>
  );
}

export function useItemData() {
  const ctx = useContext(ItemDataContext);
  if (!ctx) throw new Error('useItemData must be used within ItemDataProvider');
  return ctx;
}
