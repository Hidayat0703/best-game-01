// The shadow road and the buildable grid. The path is a polyline of waypoints;
// enemies walk it by distance travelled, and a grid cell is buildable when its
// centre stays clear of the road corridor and of the Sunspire.

import { FIELD, GRID_COLS, GRID_ROWS, PATH_POINTS, PATH_WIDTH, SPIRE, TILE } from './config.js';

function segmentLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distance from a point to one segment of the path. */
function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function createPath() {
  const segments = [];
  let total = 0;
  for (let i = 0; i < PATH_POINTS.length - 1; i += 1) {
    const a = PATH_POINTS[i];
    const b = PATH_POINTS[i + 1];
    const length = segmentLength(a, b);
    segments.push({ a, b, length, start: total });
    total += length;
  }

  /** Where an enemy is after walking `distance` along the road. */
  function pointAt(distance) {
    const d = Math.max(0, Math.min(total, distance));
    for (const seg of segments) {
      if (d <= seg.start + seg.length || seg === segments[segments.length - 1]) {
        const t = seg.length === 0 ? 0 : Math.min(1, Math.max(0, (d - seg.start) / seg.length));
        return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
      }
    }
    const last = PATH_POINTS[PATH_POINTS.length - 1];
    return { x: last.x, y: last.y };
  }

  /** Distance from a point to the road, over all its segments. */
  function distanceToPath(x, y) {
    let best = Infinity;
    for (let i = 0; i < PATH_POINTS.length - 1; i += 1) {
      best = Math.min(best, distanceToSegment(x, y, PATH_POINTS[i], PATH_POINTS[i + 1]));
    }
    return best;
  }

  /** The buildable grid: true where a tower may stand. */
  function buildableGrid() {
    const grid = [];
    for (let row = 0; row < GRID_ROWS; row += 1) {
      grid.push([]);
      for (let col = 0; col < GRID_COLS; col += 1) {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        // Row 0 sits under the HUD bar: never buildable, so no tower hides there.
        const clearOfHud = row > 0;
        const clearOfRoad = distanceToPath(cx, cy) > PATH_WIDTH / 2 + TILE / 2 - 6;
        const clearOfSpire = Math.hypot(cx - SPIRE.x, cy - SPIRE.y) > SPIRE.radius + TILE / 2 + 8;
        grid[row][col] = clearOfHud && clearOfRoad && clearOfSpire;
      }
    }
    return grid;
  }

  return { points: PATH_POINTS, total, pointAt, distanceToPath, buildableGrid };
}

/** The grid cell a field point falls in, or null when it is outside the grid. */
export function cellAt(x, y) {
  if (x < 0 || y < 0 || x >= GRID_COLS * TILE || y >= GRID_ROWS * TILE) return null;
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

/** The centre of a grid cell, in field coordinates. */
export function cellCentre(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

/** True when the point is inside the build bar (below the play area). */
export function inBuildBar(x, y) {
  return y >= FIELD.barY && y < FIELD.height;
}
