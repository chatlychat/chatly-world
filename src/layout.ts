/**
 * Where a `card_grid` puts its cards — pure math, no three.js.
 *
 * Frame: the grid's own origin, the viewer standing at (0, 0, 0) looking down
 * -z, +y up. A card's FRONT is its local +z, so `yaw` rotates it about y to
 * face the viewer and `pitch` tips it onto its back (a table). The world
 * parents the result wherever the resolved placement says; none of this knows
 * about the scene it ends up in.
 */
export const GRID_PLACEMENTS = ['arc', 'shelf', 'wall', 'table'] as const;
export type GridPlacement = (typeof GRID_PLACEMENTS)[number];

/** `stand` objects need a pedestal, `hang` ones a hanger, `lay` ones a surface. */
export type Mount = 'stand' | 'hang' | 'lay';

export interface Pose {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
}

export interface GridLayout {
  readonly poses: readonly Pose[];
  readonly mount: Mount;
}

const ARC_RADIUS = 1.2;
/** 160 degrees: past that the outer cards are behind the viewer's shoulders. */
const ARC_MAX_SPAN = (160 * Math.PI) / 180;
const SHELF_COLUMNS = 4;
const WALL_COLUMNS = 5;
const ROW_HEIGHT = 0.4;

/** Index `i` of `n` as an offset from the centre, in steps. */
const centred = (i: number, n: number): number => i - (n - 1) / 2;

export function layoutCards(placement: GridPlacement, count: number, spacing: number): GridLayout {
  const n = Math.max(0, Math.floor(count));
  const poses: Pose[] = [];
  if (placement === 'arc') {
    // Widen the circle rather than overshoot the span, so spacing is honoured.
    const radius = Math.max(ARC_RADIUS, n > 1 ? ((n - 1) * spacing) / ARC_MAX_SPAN : 0);
    const step = spacing / radius;
    for (let i = 0; i < n; i += 1) {
      const a = centred(i, n) * step;
      const x = radius * Math.sin(a);
      const z = -radius * Math.cos(a);
      poses.push({ position: [x, 0, z], yaw: Math.atan2(-x, -z), pitch: 0 });
    }
    return { poses, mount: 'stand' };
  }
  if (placement === 'table') {
    // Flat on a surface below eye height, rows coming toward the viewer.
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i += 1) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      poses.push({
        position: [
          centred(c, Math.min(cols, n - r * cols)) * spacing,
          -0.4,
          -0.7 - (rows - 1 - r) * spacing,
        ],
        yaw: 0,
        pitch: -Math.PI / 2,
      });
    }
    return { poses, mount: 'lay' };
  }
  const cols = placement === 'shelf' ? SHELF_COLUMNS : WALL_COLUMNS;
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    // A shelf fills from the bottom; a wall reads top-left to bottom-right.
    const y = placement === 'shelf' ? r * ROW_HEIGHT : 0.3 + (rows - 1 - r) * ROW_HEIGHT;
    poses.push({
      position: [centred(c, inRow) * spacing, y, placement === 'shelf' ? -1.4 : -1.8],
      yaw: 0,
      pitch: 0,
    });
  }
  return { poses, mount: placement === 'shelf' ? 'stand' : 'hang' };
}
