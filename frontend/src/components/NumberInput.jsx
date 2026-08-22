import { useEffect, useState } from 'react';
import { parseCoinsShort } from '../lib/damageFormat';

// Number input that displays empty whenever its bound value is 0 (instead of showing "0"),
// buffering the raw typed string so a user can clear the field or type a fresh number without
// the display collapsing mid-edit. Commits (clamped) on every valid keystroke, same as a plain
// controlled input; only the empty state is deferred to blur (where it commits 0).
// `min`/`max` pass `null` to leave that bound unclamped (e.g. fields that allow negative values).
// `allowSuffix` accepts K/M/B/T shorthand (lib/damageFormat's parseCoinsShort) for coin fields —
// switches to a plain text input since a native type="number" field rejects letter keystrokes
// outright, so "5m" could never even be typed into one.
export default function NumberInput({ id, value, onChange, min = 0, max, step = 1, className, placeholder, allowSuffix = false }) {
  const [text, setText] = useState(value ? String(value) : '');

  function parse(raw) {
    if (allowSuffix) return parseCoinsShort(raw);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  useEffect(() => {
    // Skips the reset while the buffered text already parses to this same value — otherwise
    // re-stringifying the committed number over text the user is still typing (e.g. "2.5m" resolves
    // correctly after every keystroke, but echoing "2500000" back mid-type would erase the "." or
    // the not-yet-typed "m") would fight them.
    if (parse(text) === value) return;
    setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function clamp(num) {
    let n = num;
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  }

  function handleChange(e) {
    const raw = e.target.value;
    setText(raw);
    if (raw === '' || raw === '-') return;
    const parsed = parse(raw);
    if (parsed === null || !Number.isFinite(parsed)) return;
    onChange(clamp(Math.floor(parsed)));
  }

  function handleBlur() {
    const parsed = parse(text);
    if (text === '' || text === '-' || parsed === null || !Number.isFinite(parsed)) {
      setText('');
      onChange(clamp(0));
    }
  }

  return (
    <input
      id={id}
      type={allowSuffix ? 'text' : 'number'}
      inputMode={allowSuffix ? 'decimal' : undefined}
      min={allowSuffix ? undefined : min ?? undefined}
      max={allowSuffix ? undefined : max ?? undefined}
      step={allowSuffix ? undefined : step}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}
