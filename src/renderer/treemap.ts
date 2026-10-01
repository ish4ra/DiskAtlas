export interface Rect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
// Balanced binary partition: exact proportional area, bounded depth, stable order.
export function layout(
  items: { id: number; size: number }[],
  width: number,
  height: number,
): Rect[] {
  const nodes = items.filter((n) => n.size > 0).sort((a, b) => b.size - a.size);
  const out: Rect[] = [];
  function split(
    start: number,
    end: number,
    x: number,
    y: number,
    w: number,
    h: number,
    total: number,
  ) {
    if (end - start === 1) {
      out.push({ id: nodes[start].id, x, y, w, h });
      return;
    }
    let sum = 0;
    let mid = start;
    while (mid < end - 1 && sum < total / 2) {
      sum += nodes[mid++].size;
    }
    const ratio = sum / total;
    if (w >= h) {
      split(start, mid, x, y, w * ratio, h, sum);
      split(mid, end, x + w * ratio, y, w * (1 - ratio), h, total - sum);
    } else {
      split(start, mid, x, y, w, h * ratio, sum);
      split(mid, end, x, y + h * ratio, w, h * (1 - ratio), total - sum);
    }
  }
  if (nodes.length && width > 0 && height > 0)
    split(
      0,
      nodes.length,
      0,
      0,
      width,
      height,
      nodes.reduce((s, n) => s + n.size, 0),
    );
  return out;
}
