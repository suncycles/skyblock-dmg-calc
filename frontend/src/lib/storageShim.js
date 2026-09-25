// With site data blocked, touching localStorage or sessionStorage throws, and the app reads both
// during its first render. Swaps in a per-tab memory store so the app still runs; nothing persists
// across reloads. Imported first in main.jsx, so it runs before any module that reads storage.
function memoryStorage() {
  const memory = new Map();
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => void memory.set(key, String(value)),
    removeItem: (key) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  };
}

for (const name of ['localStorage', 'sessionStorage']) {
  try {
    window[name].getItem('');
  } catch {
    Object.defineProperty(window, name, { configurable: true, value: memoryStorage() });
  }
}
