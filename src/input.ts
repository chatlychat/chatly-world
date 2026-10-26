/**
 * Picking: a ray in, an interactive thing out. The host owns input — its
 * controllers, hands, gaze and mouse — so this is only the part that knows
 * which of OUR objects a ray hit.
 *
 * Anything a renderer wants tappable is marked with `interactive(obj, kind,
 * activate)`; `pick` walks up from whatever mesh the ray struck to the first
 * marked ancestor, so a renderer marks the root of its node and every child
 * works. An override can opt out of the world's default tap by setting
 * `userData.cl3Handled`.
 */
import { Quaternion, Raycaster, Vector3, type Camera, type Object3D } from 'three';

export type InteractiveKind = 'card' | 'release' | 'send' | 'field';

export interface Interactive {
  readonly kind: InteractiveKind;
  readonly activate: () => void;
}

export interface Hit extends Interactive {
  readonly object: Object3D;
  readonly distance: number;
}

export function interactive(obj: Object3D, kind: InteractiveKind, activate: () => void): void {
  obj.userData['cl3'] = { kind, activate } satisfies Interactive;
}

const marked = (o: Object3D): Interactive | undefined =>
  o.userData['cl3'] as Interactive | undefined;

export function pickRay(
  root: Object3D,
  origin: Vector3,
  direction: Vector3,
  maxMetres = 10,
): Hit | null {
  const ray = new Raycaster(origin, direction.clone().normalize(), 0, maxMetres);
  root.updateMatrixWorld(true);
  for (const h of ray.intersectObject(root, true)) {
    for (let o: Object3D | null = h.object; o !== null; o = o.parent) {
      const m = marked(o);
      if (m !== undefined) {
        return { ...m, object: o, distance: h.distance };
      }
    }
  }
  return null;
}

const FORWARD = new Vector3(0, 0, -1);

/** The pointing ray of a controller or hand: its world position, along its -z. */
export function rayOf(source: Object3D): { origin: Vector3; direction: Vector3 } {
  source.updateWorldMatrix(true, false);
  const q = source.getWorldQuaternion(new Quaternion());
  return {
    origin: source.getWorldPosition(new Vector3()),
    direction: FORWARD.clone().applyQuaternion(q),
  };
}

/** Listen for `select` on a three XR controller (a trigger or a hand pinch). */
export function attachController(
  root: Object3D,
  controller: Object3D,
  onHit: (h: Hit) => void,
): () => void {
  const listener = (): void => {
    const { origin, direction } = rayOf(controller);
    const h = pickRay(root, origin, direction);
    if (h !== null) {
      onHit(h);
    }
  };
  const c = controller as unknown as {
    addEventListener(t: string, l: () => void): void;
    removeEventListener(t: string, l: () => void): void;
  };
  c.addEventListener('select', listener);
  return () => c.removeEventListener('select', listener);
}

/**
 * Gaze with dwell: looking at one thing for `dwellMs` activates it. Returns a
 * stepper to call each frame; its result is progress 0..1 for a reticle.
 */
export class Gaze {
  private target: Object3D | null = null;
  private elapsed = 0;
  public progress = 0;

  public constructor(
    private readonly root: Object3D,
    private readonly camera: Camera,
    private readonly dwellMs: number,
    private readonly onHit: (h: Hit) => void,
  ) {}

  public update(dtMs: number): void {
    const { origin, direction } = rayOf(this.camera);
    const h = pickRay(this.root, origin, direction);
    if (h === null || h.object !== this.target) {
      this.target = h?.object ?? null;
      this.elapsed = 0;
      this.progress = 0;
      return;
    }
    this.elapsed += dtMs;
    this.progress = Math.min(1, this.elapsed / this.dwellMs);
    if (this.progress >= 1) {
      this.elapsed = 0;
      this.progress = 0;
      this.onHit(h);
    }
  }
}
