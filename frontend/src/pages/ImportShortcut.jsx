import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ENTRY_DISMISSED_KEY } from '../lib/entryScreen';

// /import/:username — a shareable direct link straight into the Hypixel import flow (e.g.
// skydmg.pages.dev/import/sammui), skipping EntryScreen's username-typing step entirely.
// Redirects to the exact same place EntryScreen's own submit lands (HypixelImport.jsx already
// auto-runs the import when it receives a username via router state, see its own comment) — this
// is just a second, URL-addressable way to arrive there, not a separate import implementation.
export default function ImportShortcut() {
  const { username } = useParams();

  // Same dismissal EntryScreen's onSkip does — arriving via a direct link is exactly as much
  // "already engaged with the app" as submitting the form, so it shouldn't be shown afterward.
  useEffect(() => {
    sessionStorage.setItem(ENTRY_DISMISSED_KEY, '1');
  }, []);

  return <Navigate to="/hypixel-import" state={{ username }} replace />;
}
