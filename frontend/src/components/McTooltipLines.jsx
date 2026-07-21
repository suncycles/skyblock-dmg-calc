// Pure presentational: renders pre-parsed (parseMinecraftLine'd) §-coded
// lines as colored spans. Shared by TooltipContext's hover overlay and
// any other place that needs the exact same real-Minecraft-tooltip look
// without the hover/floating-position behavior (see PetDetail.jsx, which
// shows one permanently rather than on hover).
export default function McTooltipLines({ parsedLines }) {
  return parsedLines.map((segments, i) => (
    <div key={i}>
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
