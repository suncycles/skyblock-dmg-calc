// Session-scoped (not persisted across browser restarts) flag for whether the SkyCrypt-style
// entry screen (components/EntryScreen.jsx) has already been dismissed this tab — shared between
// Landing.jsx (which owns the actual show/hide state) and TopBar.jsx.
export const ENTRY_DISMISSED_KEY = 'skydmgEntryDismissed';

// Fired by TopBar.jsx's brand/logo click so an already-mounted Landing.jsx (the user is already on
// "/") re-shows the entry screen live — a plain navigate("/") is a no-op when you're already on
// that route, so clearing ENTRY_DISMISSED_KEY alone wouldn't be enough to bring it back without
// this. Landing.jsx listens for it in a useEffect.
export const SHOW_ENTRY_EVENT = 'skydmg:show-entry';
