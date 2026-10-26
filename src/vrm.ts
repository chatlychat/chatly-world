/**
 * VRM avatars — the optional half of the agent's body.
 *
 * `@pixiv/three-vrm` is an OPTIONAL peer dependency. This file never imports
 * it statically, and the dynamic import below names it through a computed
 * specifier, so no bundler resolves it while building a glTF-only host: that
 * host neither installs it nor ships a byte of it. A host that does use VRM
 * installs it and, if it bundles, hands the import over as `loadVrm`:
 * `loadVrm: () => import('@pixiv/three-vrm')`. That one line is what lets ITS
 * bundler see the package.
 *
 * API used (three-vrm v3, https://pixiv.github.io/three-vrm/packages/three-vrm/docs/):
 * `VRMLoaderPlugin` registered on a `GLTFLoader` leaves the `VRM` on
 * `gltf.userData.vrm`; `vrm.expressionManager.setValue(name, 0..1)`;
 * `vrm.lookAt.target`; `vrm.humanoid.getNormalizedBoneNode(bone)`;
 * `vrm.update(deltaSeconds)`; `VRMUtils.rotateVRM0(vrm)`.
 */
import { Group, Vector3, type Camera, type Object3D } from 'three';

import { WorldError } from './types.js';

import type { AgentExpression } from '@chatlychat/core';

export const VRM_PEER = '@pixiv/three-vrm';

/** The slice of three-vrm's `VRM` the SDK touches, so a spec can stand in. */
export interface VrmLike {
  readonly scene: Object3D;
  readonly expressionManager?: { setValue(name: string, weight: number): void } | null;
  readonly lookAt?: { target?: Object3D | null } | null;
  readonly humanoid?: { getNormalizedBoneNode(name: string): Object3D | null } | null;
  update(deltaSeconds: number): void;
}

/** The slice of the `@pixiv/three-vrm` module the loader needs. */
export interface VrmModule {
  readonly VRMLoaderPlugin: new (parser: unknown) => unknown;
  readonly VRMUtils?: { rotateVRM0?(vrm: VrmLike): void };
}

/** What a host passes as `loadVrm`: `() => import('@pixiv/three-vrm')`. */
export type VrmModuleLoader = () => Promise<VrmModule>;

/** The module, or a typed error that names the missing peer and how to fix it. */
export async function loadVrmModule(custom?: VrmModuleLoader): Promise<VrmModule> {
  try {
    // A computed specifier on purpose: see the header.
    const spec = ['@pixiv', 'three-vrm'].join('/');
    const mod = await (
      custom ??
      (() => import(/* @vite-ignore */ /* webpackIgnore: true */ spec) as Promise<VrmModule>)
    )();
    if (typeof mod.VRMLoaderPlugin !== 'function') {
      throw new Error('no VRMLoaderPlugin export');
    }
    return mod;
  } catch (cause) {
    const e = new WorldError(
      'missing_peer',
      `VRM avatars need the optional peer dependency ${VRM_PEER}. Run \`npm install ${VRM_PEER}\`; ` +
        `if you bundle, also pass \`loadVrm\` (a function returning import(...) of it) to createWorld.`,
    );
    (e as { cause?: unknown }).cause = cause;
    throw e;
  }
}

/** The glTF carries a VRM 0.x (`VRM`) or 1.0 (`VRMC_vrm`) extension. */
export function hasVrmExtension(gltf: {
  userData?: Record<string, unknown>;
  parser?: { json?: { extensionsUsed?: unknown } };
}): boolean {
  const ext = gltf.userData?.['gltfExtensions'];
  if (typeof ext === 'object' && ext !== null && ('VRM' in ext || 'VRMC_vrm' in ext)) {
    return true;
  }
  const used = gltf.parser?.json?.extensionsUsed;
  return Array.isArray(used) && used.some((x) => x === 'VRM' || x === 'VRMC_vrm');
}

/** Which loader an avatar needs: its declared format wins; the extension catches an unlabelled file. */
export const wantsVrm = (
  format: string | undefined,
  gltf?: Parameters<typeof hasVrmExtension>[0],
) => format === 'vrm' || (gltf !== undefined && hasVrmExtension(gltf));

export type VrmVowel = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';

/**
 * Chatly viseme -> one of VRM's five mouth expressions, and how far to open it.
 * Keys are compared lower-case with any `viseme_` prefix removed. A viseme not
 * listed, `sil` and `PP` (lips shut) all close the mouth.
 */
export const VISEME_TO_VRM: Readonly<Record<string, readonly [VrmVowel, number] | null>> = {
  // VRM's own vowels, and the Oculus vowels.
  aa: ['aa', 1],
  ih: ['ih', 1],
  ou: ['ou', 1],
  ee: ['ee', 1],
  oh: ['oh', 1],
  e: ['ee', 1],
  i: ['ih', 1],
  o: ['oh', 1],
  u: ['ou', 1],
  // Oculus consonants: the nearest vowel shape, held shallower.
  ff: ['ih', 0.4],
  th: ['ih', 0.5],
  dd: ['aa', 0.4],
  kk: ['aa', 0.4],
  ch: ['ou', 0.5],
  ss: ['ih', 0.5],
  nn: ['ih', 0.3],
  rr: ['ou', 0.5],
  pp: null,
  sil: null,
};

export const VRM_VOWELS: readonly VrmVowel[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

export function vrmVisemeFor(v: string): readonly [VrmVowel, number] | null {
  return VISEME_TO_VRM[v.toLowerCase().replace(/^viseme_/, '')] ?? null;
}

/**
 * Chatly `embodiment.expression` -> VRM preset and weight. The rest (`nod`,
 * `shake_head`, `point`, `wave`, `shrug`, `think`) are gestures, not faces: they
 * play only as the host's clip from `presence.expressions`. No Chatly expression
 * is `angry` or `relaxed`, so those presets are never driven.
 */
export const EXPRESSION_TO_VRM: Readonly<
  Partial<Record<AgentExpression, readonly [string, number]>>
> = {
  smile: ['happy', 0.7],
  laugh: ['happy', 1],
  surprised: ['surprised', 1],
  concerned: ['sad', 0.6],
};

const HOLD_S = 2.5;
const FADE_OUT_S = 0.5;
const EASE_IN_S = 0.12;
const BLINK_EVERY_S = 4;
const BLINK_S = 0.15;
const HEAD_YAW = 0.6;
const HEAD_PITCH = 0.35;
const HEAD_RATE = 8;

/** Drives one loaded VRM: mouth, face, blink, gaze, and `vrm.update`. */
export class VrmRig {
  private readonly target = new Group();
  private face: { name: string; weight: number; age: number } | null = null;
  private mouth: VrmVowel | null = null;
  private clock = 0;
  private head = { yaw: 0, pitch: 0 };

  public constructor(
    public readonly vrm: VrmLike,
    public reduced: boolean,
  ) {
    this.target.name = 'cl3-agent-gaze';
    if (vrm.lookAt != null) {
      vrm.lookAt.target = this.target;
    }
  }

  public get gazeTarget(): Object3D {
    return this.target;
  }

  private set(name: string, w: number): void {
    this.vrm.expressionManager?.setValue(name, w);
  }

  /** Open one of the five vowels (or close the mouth with null). Always zeroes the other four. */
  public setMouth(v: string | null, w: number): void {
    const hit = v === null ? null : vrmVisemeFor(v);
    const vowel = hit === null ? null : hit[0];
    for (const name of VRM_VOWELS) {
      this.set(name, name === vowel ? Math.min(1, w * (hit?.[1] ?? 0)) : 0);
    }
    this.mouth = vowel;
  }

  /** Show a face for a cue; false when the expression is a gesture with no VRM preset. */
  public express(e: AgentExpression | null): boolean {
    const p = e === null ? undefined : EXPRESSION_TO_VRM[e];
    if (p === undefined) {
      return false;
    }
    if (this.face !== null && this.face.name !== p[0]) {
      this.set(this.face.name, 0);
    }
    this.face = { name: p[0], weight: p[1], age: 0 };
    return true;
  }

  /** Point the eyes and head at a world position (null = release the head). */
  public gazeAt(root: Object3D, at: Vector3 | null, dt: number): void {
    const bone = this.vrm.humanoid?.getNormalizedBoneNode('head');
    const k = this.reduced ? 1 : 1 - Math.exp(-HEAD_RATE * dt);
    let yaw = 0;
    let pitch = 0;
    if (at !== null && bone != null) {
      this.target.position.copy(at);
      this.target.updateMatrixWorld(true);
      const from = root.worldToLocal(bone.getWorldPosition(new Vector3()));
      const to = root.worldToLocal(at.clone());
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      yaw = Math.max(-HEAD_YAW, Math.min(HEAD_YAW, Math.atan2(dx, dz)));
      pitch = Math.max(
        -HEAD_PITCH,
        Math.min(HEAD_PITCH, -Math.atan2(to.y - from.y, Math.hypot(dx, dz))),
      );
    }
    this.head = {
      yaw: this.head.yaw + (yaw - this.head.yaw) * k,
      pitch: this.head.pitch + (pitch - this.head.pitch) * k,
    };
    // A head never driven is left to the clips; one released is eased home, then left alone.
    if (
      bone != null &&
      (at !== null || Math.abs(this.head.yaw) + Math.abs(this.head.pitch) > 1e-3)
    ) {
      bone.rotation.set(this.head.pitch, this.head.yaw, 0);
    }
  }

  /** Advance the face and blink, then `vrm.update`. Call after the mixer and the gaze. */
  public update(dt: number): void {
    this.clock += dt;
    const f = this.face;
    if (f !== null) {
      f.age += dt;
      const fade = this.reduced ? 0 : FADE_OUT_S;
      const k = this.reduced
        ? Number(f.age <= HOLD_S)
        : f.age < EASE_IN_S
          ? f.age / EASE_IN_S
          : f.age <= HOLD_S
            ? 1
            : 1 - (f.age - HOLD_S) / fade;
      this.set(f.name, f.weight * Math.max(0, Math.min(1, k)));
      if (f.age >= HOLD_S + fade) {
        this.set(f.name, 0);
        this.face = null;
      }
    }
    // A held, motionless blink would read as a fault, so reduced motion has none.
    const phase = this.clock % BLINK_EVERY_S;
    this.set(
      'blink',
      this.reduced || phase > BLINK_S ? 0 : 1 - Math.abs(1 - (2 * phase) / BLINK_S),
    );
    this.vrm.update(dt);
  }

  public get openVowel(): VrmVowel | null {
    return this.mouth;
  }
}

/** Where the agent should look, as a world position, for `gazeAt`. */
export function gazePoint(
  gaze: Object3D | Vector3 | 'visitor' | null,
  camera: Camera,
): Vector3 | null {
  if (gaze === null) {
    return null;
  }
  if (gaze === 'visitor') {
    return camera.getWorldPosition(new Vector3());
  }
  return gaze instanceof Vector3 ? gaze : gaze.getWorldPosition(new Vector3());
}
