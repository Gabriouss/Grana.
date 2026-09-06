/** Keep all data points, but only label ticks that fit in the available width. */
export function visibleChartLabels(count: number, width: number, labelWidth = 64): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const slots = Math.min(count, Math.max(1, Math.floor(width / labelWidth) + 1));
  if (slots === 1) return [count - 1];
  return Array.from({ length: slots }, (_, i) => Math.round(i * (count - 1) / (slots - 1)));
}
