// Pure presentational: renders pre-parsed (parseMinecraftLine'd) §-coded lines as colored spans.
export default function McTooltipLines({ parsedLines }) {
  return parsedLines.map((segments, i) => (
    // Blank lines get extra margin so section breaks (stat block/ability text/footer) actually read as breaks.
    <div key={i} style={segments.length === 0 ? { marginTop: '3px', marginBottom: '3px' } : undefined}>
      {segments.length === 0
        ? ' '
        : segments.map((seg, j) => (
            <span
              key={j}
              style={{
                color: seg.color,
                fontWeight: seg.bold ? 'bold' : undefined,
                fontStyle: seg.italic ? 'italic' : undefined,
                textDecoration:
                  [seg.underline && 'underline', seg.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
              }}
            >
              {seg.text}
            </span>
          ))}
    </div>
  ));
}
