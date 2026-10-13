/**
 * Constellation glyph — the brand motif for first-class empty states
 * (DESIGN.md: "empty/loading states designed like first-class screens").
 * Token-driven: inherits `currentColor` (accent).
 */
export function ConstellationGlyph() {
  return (
    <svg
      viewBox="0 0 200 96"
      className="mx-auto h-28 w-44 text-accent"
      aria-hidden="true"
      fill="none"
    >
      <polyline
        points="8,78 44,54 76,62 112,30 148,40 190,12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="3 5"
        opacity="0.55"
      />
      {(
        [
          [8, 78, 2],
          [44, 54, 3],
          [76, 62, 2],
          [112, 30, 3.5],
          [148, 40, 2],
          [190, 12, 3],
        ] as const
      ).map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" opacity="0.9" />
      ))}
    </svg>
  );
}
