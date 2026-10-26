/**
 * The slice of three.js this package uses, declared by hand.
 *
 * three ships no typings (they are `@types/three`, a separate package this
 * package does not add), so this ambient declaration is what `tsc` checks the
 * source against. It is deliberately narrow — only members the source calls —
 * and the specs run against the REAL three, which is what catches a member
 * declared here that does not exist there. A .d.ts input is never emitted, so
 * the published declarations name `three`'s types and resolve against the
 * consumer's own typings.
 */
declare module 'three' {
  export const DoubleSide: 2;
  export const SRGBColorSpace: 'srgb';
  export const LoopOnce: 2200;

  export class Vector2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
    set(x: number, y: number): this;
  }
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    setY(y: number): this;
    setScalar(s: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    negate(): this;
    normalize(): this;
    multiplyScalar(s: number): this;
    divideScalar(s: number): this;
    addScaledVector(v: Vector3, s: number): this;
    applyQuaternion(q: Quaternion): this;
    distanceTo(v: Vector3): number;
    lengthSq(): number;
  }
  export class Quaternion {
    constructor(x?: number, y?: number, z?: number, w?: number);
  }
  export class Euler {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number, order?: string): this;
    copy(e: Euler): this;
  }
  export class Box3 {
    min: Vector3;
    max: Vector3;
    setFromObject(o: Object3D): this;
    isEmpty(): boolean;
    getCenter(target: Vector3): Vector3;
  }
  export class Shape {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadraticCurveTo(cx: number, cy: number, x: number, y: number): this;
  }

  export class Object3D {
    name: string;
    parent: Object3D | null;
    children: Object3D[];
    visible: boolean;
    position: Vector3;
    rotation: Euler;
    quaternion: Quaternion;
    scale: Vector3;
    userData: Record<string, unknown>;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    removeFromParent(): this;
    clone(recursive?: boolean): this;
    traverse(cb: (o: Object3D) => void): void;
    getObjectByName(name: string): Object3D | undefined;
    getWorldPosition(target: Vector3): Vector3;
    getWorldQuaternion(target: Quaternion): Quaternion;
    getWorldDirection(target: Vector3): Vector3;
    worldToLocal(v: Vector3): Vector3;
    updateMatrixWorld(force?: boolean): void;
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
  }
  export class Group extends Object3D {}
  export class Camera extends Object3D {}
  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
  }

  export class BufferGeometry {
    dispose(): void;
  }
  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number);
  }
  export class ShapeGeometry extends BufferGeometry {
    constructor(shape: Shape);
  }
  export class RingGeometry extends BufferGeometry {
    constructor(inner?: number, outer?: number, segments?: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(
      top?: number,
      bottom?: number,
      height?: number,
      radial?: number,
      heightSegs?: number,
      open?: boolean,
    );
  }
  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radial?: number);
  }
  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegs?: number, heightSegs?: number);
  }
  export class CapsuleGeometry extends BufferGeometry {
    constructor(radius?: number, length?: number, capSegs?: number, radialSegs?: number);
  }
  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }

  export class Texture {
    colorSpace: string;
    dispose(): void;
  }
  export class CanvasTexture extends Texture {
    constructor(canvas: unknown);
  }

  export class Material {
    opacity: number;
    transparent: boolean;
    needsUpdate: boolean;
    userData: Record<string, unknown>;
    dispose(): void;
  }
  interface SurfaceParams {
    color?: string;
    emissive?: string;
    emissiveIntensity?: number;
    side?: number;
    transparent?: boolean;
    opacity?: number;
    roughness?: number;
    metalness?: number;
    transmission?: number;
    visible?: boolean;
  }
  export class MeshBasicMaterial extends Material {
    constructor(params?: SurfaceParams);
    color: { getHexString(): string };
  }
  export class MeshStandardMaterial extends Material {
    constructor(params?: SurfaceParams);
    map: Texture | null;
    emissiveMap: Texture | null;
    emissiveIntensity: number;
    color: { getHexString(): string };
  }
  export class MeshPhysicalMaterial extends MeshStandardMaterial {}
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
    geometry: BufferGeometry;
    material: Material;
  }

  export class Raycaster {
    ray: { origin: Vector3; direction: Vector3 };
    constructor(origin?: Vector3, direction?: Vector3, near?: number, far?: number);
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObject(o: Object3D, recursive?: boolean): { object: Object3D; distance: number }[];
  }

  export class AnimationClip {
    name: string;
    constructor(name?: string, duration?: number, tracks?: unknown[]);
    static findByName(clips: AnimationClip[], name: string): AnimationClip | null;
  }
  export class AnimationAction {
    paused: boolean;
    clampWhenFinished: boolean;
    reset(): this;
    play(): this;
    stop(): this;
    setLoop(mode: number, repetitions: number): this;
    crossFadeFrom(from: AnimationAction, seconds: number, warp?: boolean): this;
    getClip(): AnimationClip;
  }
  export class AnimationMixer {
    constructor(root: Object3D);
    clipAction(clip: AnimationClip): AnimationAction;
    stopAllAction(): this;
    update(deltaSeconds: number): this;
  }
}

declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  import type { AnimationClip, Object3D } from 'three';
  export class GLTFLoader {
    loadAsync(url: string): Promise<{ scene: Object3D; animations: AnimationClip[] }>;
  }
}
