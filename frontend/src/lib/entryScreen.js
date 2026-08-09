// Session-scoped (not persisted across browser restarts) flag for whether the SkyCrypt-style
// entry screen (components/EntryScreen.jsx) has already been dismissed this tab — shared between
// Landing.jsx (which owns the actual show/hide state) and TopBar.jsx (whose brand link needs to
// send the user to the loadout grid, not re-trigger the entry prompt).
export const ENTRY_DISMISSED_KEY = 'skydmgEntryDismissed';
