import { useEffect, useState } from 'react';

// Number input that displays empty whenever its bound value is 0 (instead of showing "0"),
// buffering the raw typed string so a user can clear the field or type a fresh number without
// the display collapsing mid-edit. Commits (clamped) on every valid keystroke, same as a plain
// controlled input; only the empty state is deferred to blur (where it commits 0).
// `min`/`max` pass `null` to leave that bound unclamped (e.g. fields that allow negative values).
export default function NumberInput({ id, value, onChange, min = 0, max, step = 1, className, placeholder }) {
  const [text, setText] = useState(value ? String(value) : '');

  useEffect(() => {
    setText(value ? String(value) : '');
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
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(Math.floor(parsed)));
  }

  function handleBlur() {
    if (text === '' || text === '-' || !Number.isFinite(Number(text))) {
      setText('');
      onChange(clamp(0));
    }
  }

  return (
    <input
      id={id}
      type="number"
      min={min ?? undefined}
      max={max ?? undefined}
      step={step}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}
