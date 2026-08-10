import { Component } from 'react';

const panel =
  'bg-[#c6c6c6] border-[3px] border-t-white border-l-white border-b-[#555555] border-r-[#555555] outline outline-2 outline-black';

// Catches render-time errors anywhere below it so a bug on one page (e.g. a bad saved-loadout
// decode) shows a recoverable message instead of unmounting the whole app to a blank black
// screen — see App.jsx. Must be a class component; React only supports error boundaries via
// getDerivedStateFromError/componentDidCatch, no hook equivalent exists.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className={`${panel} max-w-[500px] p-6 flex flex-col gap-3`}>
          <div className="text-lg font-bold text-black">Something went wrong.</div>
          <div className="text-xs font-mono text-neutral-700 break-words">{String(this.state.error?.message || this.state.error)}</div>
          <button
            type="button"
            className="self-start px-4 py-2 bg-neutral-800 text-white text-sm font-bold cursor-pointer hover:brightness-110"
            onClick={() => window.location.assign('/')}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }
}
