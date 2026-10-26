/**
 * Entrance and pick animation, and the one switch that stops all of it.
 *
 * Reduced motion is a viewer's accessibility setting, so it is enforced HERE
 * rather than asked of each caller: with it on, `run` applies the final frame
 * synchronously and schedules nothing. A renderer that animates through this
 * cannot forget to honour it.
 */
import type { Object3D } from 'three';

export type Easing = (t: number) => number;
export const easeOut: Easing = (t) => 1 - (1 - t) ** 3;

interface Tween {
  elapsed: number;
  readonly duration: number;
  readonly apply: (t: number) => void;
}

export class Motion {
  private readonly tweens = new Set<Tween>();
  public reduced: boolean;

  public constructor(reduced: boolean) {
    this.reduced = reduced;
  }

  /** `apply(0..1)`; always ends with `apply(1)`. */
  public run(durationMs: number, apply: (t: number) => void): void {
    if (this.reduced || durationMs <= 0) {
      apply(1);
      return;
    }
    apply(0);
    this.tweens.add({ elapsed: 0, duration: durationMs, apply });
  }

  public update(dtMs: number): void {
    for (const tw of [...this.tweens]) {
      tw.elapsed += dtMs;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.apply(easeOut(t));
      if (t >= 1) {
        this.tweens.delete(tw);
      }
    }
  }

  public get running(): number {
    return this.tweens.size;
  }

  public clear(): void {
    this.tweens.clear();
  }
}

/** Set opacity on every material under `obj`. Materials are made transparent first. */
export function setOpacity(obj: Object3D, k: number): void {
  obj.traverse((o) => {
    const mats = (o as { material?: unknown }).material;
    for (const m of Array.isArray(mats) ? mats : mats === undefined ? [] : [mats]) {
      const mat = m as { opacity: number; transparent: boolean; userData: { base?: number } };
      mat.userData.base ??= mat.opacity;
      mat.transparent = true;
      mat.opacity = mat.userData.base * k;
    }
  });
}

export type Entrance = 'fade' | 'scale' | 'slide' | 'none';

/** The theme's `motionEntrance` applied to a freshly built object. */
export function enter(motion: Motion, obj: Object3D, kind: Entrance, durationMs = 250): void {
  if (kind === 'none') {
    return;
  }
  const y = obj.position.y;
  const s = obj.scale.x;
  motion.run(durationMs, (t) => {
    if (kind === 'fade') {
      setOpacity(obj, t);
    } else if (kind === 'scale') {
      obj.scale.setScalar(Math.max(0.001, s * t));
    } else {
      obj.position.y = y - 0.1 * (1 - t);
    }
  });
}
