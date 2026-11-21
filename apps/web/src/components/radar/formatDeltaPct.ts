/** Direction by glyph and text: the percentage is rounded first, so a change that rounds to 0 shows no arrow. */
export function formatDeltaPct(deltaPct: number) {
  const rounded = Math.round(deltaPct);
  if (rounded > 0) return { icon: '▲', text: `+${rounded}%` };
  if (rounded < 0) return { icon: '▼', text: `−${Math.abs(rounded)}%` };
  return { icon: '', text: '0%' };
}
