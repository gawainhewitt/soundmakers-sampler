// Shared tile configuration used by both the play grid and the settings screen
// so they stay visually consistent (same colours, same layout).

export const SQUARE_COLORS = [
  '#FF4E3A', // red-orange
  '#FFD05A', // yellow
  '#6EEAA0', // mint green
  '#A8C86A', // olive green
  '#FF6B9D', // hot pink
  '#FF9130', // orange
  '#B97FE8', // purple
  '#5BEDA0', // bright green
];

// Grid dimensions per tile count and orientation, chosen so tiles fill the
// whole grid (no empty cells), keeping them as large as possible and centred.
export const GRID_LAYOUTS = {
  portrait: { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4] },
  landscape: { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2] },
};

export function computeGrid(count, orient) {
  const layout = GRID_LAYOUTS[orient] && GRID_LAYOUTS[orient][count];
  if (layout) return { cols: layout[0], rows: layout[1] };
  // Fallback for any other count: fill the grid with as few cells as possible
  let cols = Math.ceil(Math.sqrt(count));
  let rows = Math.ceil(count / cols);
  if (orient === 'portrait' && cols > rows) [cols, rows] = [rows, cols];
  while (cols * rows < count) {
    if (orient === 'portrait') rows++;
    else cols++;
  }
  return { cols, rows };
}