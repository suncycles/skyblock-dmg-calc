// Pure presentational: renders pre-parsed (parseMinecraftLine'd) §-coded
// lines as colored spans. Shared by TooltipContext's hover overlay and
// any other place that needs the exact same real-Minecraft-tooltip look
// without the hover/floating-position behavior (see PetDetail.jsx, which
// shows one permanently rather than on hover).
export default function McTooltipLines({ parsedLines }) {
  return parsedLines.map((segments, i) => (
    // Real item lore uses a blank line to separate sections (stat block,
    // ability text, footer requirements/rarity tag) — the default
    // line-height alone reads as barely-there on screen, so blank rows
    // get extra margin on top of it to make that section break actually
    // read as a break.
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
