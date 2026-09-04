import { createContext, useCallback, useContext, useRef, useState } from 'react';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

const ConfirmDialogContext = createContext(null);

// In-app replacement for window.confirm/window.alert — styled like the rest of the app's
// bordered chest-GUI panels (and theme-aware) instead of the browser's native dialog, which
// looks jarring against the rest of the UI and can't be styled at all.
export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { message, alertOnly }
  const resolveRef = useRef(null);

  const confirmDialog = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ message, alertOnly: false });
    });
  }, []);

  const alertDialog = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ message, alertOnly: true });
    });
  }, []);

  function handleChoice(result) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }

  return (
    <ConfirmDialogContext.Provider value={{ confirmDialog, alertDialog }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => handleChoice(false)}
        >
          <div className={`${panel} popup-panel w-full max-w-[380px] p-5 flex flex-col gap-4`} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-black whitespace-pre-line">{dialog.message}</div>
            <div className="flex justify-end gap-2">
              {!dialog.alertOnly && (
                <button
                  className="px-4 py-2 text-sm font-bold text-black bg-neutral-300 outline outline-1 outline-black hover:brightness-95 cursor-pointer"
                  onClick={() => handleChoice(false)}
                >
                  Cancel
                </button>
              )}
              <button
                autoFocus
                className="px-4 py-2 text-sm font-bold text-white bg-[#3a8f3a] border-2 border-t-[#6fd66f] border-l-[#6fd66f] border-b-[#1f4f1f] border-r-[#1f4f1f] outline outline-1 outline-black hover:brightness-110 cursor-pointer"
                onClick={() => handleChoice(true)}
              >
                {dialog.alertOnly ? 'OK' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  return ctx;
}
