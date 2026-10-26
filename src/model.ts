/**
 * glTF loading and the `anchor` a model asks for.
 *
 * Chatly references a model and never fetches, validates or sizes one, so
 * this is where the host's world does: three's own GLTFLoader (imported
 * lazily, so a conversation with no models never pays for it), the block's
 * `scale` as a multiplier on the file's own size, and `anchor` as the named
 * point of the model that sits at the placement's origin.
 */
import { Box3, Group, Vector3, type AnimationClip, type Object3D } from 'three';

import { loadVrmModule, wantsVrm, type VrmLike, type VrmModuleLoader } from './vrm.js';

export const MODEL_ANCHORS = ['center', 'base', 'top', 'back'] as const;
export type ModelAnchor = (typeof MODEL_ANCHORS)[number];

export interface LoadedModel {
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
  /** Present when the file was loaded through three-vrm. */
  readonly vrm?: VrmLike | null;
}
/** `hint.format` is the avatar's declared format; a loader may use it to pick a plugin. */
export type ModelLoader = (url: string, hint?: { format?: string }) => Promise<LoadedModel>;

interface GltfResult extends LoadedModel {
  readonly userData?: Record<string, unknown>;
  readonly parser?: { json?: { extensionsUsed?: unknown } };
}
/** The slice of three's `GLTFLoader` used here. */
export interface GltfLoaderLike {
  register(plugin: (parser: unknown) => unknown): unknown;
  loadAsync(url: string): Promise<GltfResult>;
}

export interface GltfLoaderOptions {
  /** `() => import('@pixiv/three-vrm')` — needed only to load VRM avatars through a bundler. */
  readonly loadVrm?: VrmModuleLoader;
  /** Test seam: a fresh loader. Defaults to three's own `GLTFLoader`, imported lazily. */
  readonly createLoader?: () => Promise<GltfLoaderLike>;
}

const threeLoader = async (): Promise<GltfLoaderLike> => {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  return new GLTFLoader() as unknown as GltfLoaderLike;
};

/**
 * three's GLTFLoader, plus VRM when the avatar is one: by its declared
 * `format: 'vrm'`, or because the loaded file carries the VRM extension.
 * `@pixiv/three-vrm` is only touched on those two paths; a plain glTF never
 * asks for it.
 */
export const gltfLoader = (opts: GltfLoaderOptions = {}): ModelLoader => {
  const create = opts.createLoader ?? threeLoader;
  let plain: GltfLoaderLike | null = null;
  const withVrm = async (url: string): Promise<LoadedModel> => {
    const mod = await loadVrmModule(opts.loadVrm);
    const loader = await create();
    loader.register((parser) => new mod.VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = (gltf.userData?.['vrm'] ?? null) as VrmLike | null;
    if (vrm === null) {
      // Declared VRM but the file has no VRM data: it is a plain glTF after all.
      return gltf;
    }
    mod.VRMUtils?.rotateVRM0?.(vrm); // VRM 0.x faces -Z; this turns it to +Z, and ignores 1.0
    return { scene: vrm.scene, animations: gltf.animations, vrm };
  };
  return async (url, hint) => {
    if (wantsVrm(hint?.format)) {
      return withVrm(url);
    }
    plain ??= await create();
    const gltf = await plain.loadAsync(url);
    return wantsVrm(undefined, gltf) ? withVrm(url) : gltf;
  };
};

/** Load each URL once; every caller gets its own clone, because a scene can have one parent. */
export const cachedLoader = (load: ModelLoader): ModelLoader => {
  const cache = new Map<string, Promise<LoadedModel>>();
  return async (url, hint) => {
    let p = cache.get(url);
    if (p === undefined) {
      p = hint === undefined ? load(url) : load(url, hint);
      cache.set(url, p);
      // A failure is not cached: the next card gets a fresh attempt.
      p.catch(() => cache.delete(url));
    }
    const m = await p;
    return { scene: m.scene.clone(true), animations: m.animations };
  };
};

/** The translation that moves `anchor` of `box` to the origin. */
export function anchorOffset(box: Box3, anchor: ModelAnchor): Vector3 {
  const c = box.getCenter(new Vector3());
  const p =
    anchor === 'base'
      ? new Vector3(c.x, box.min.y, c.z)
      : anchor === 'top'
        ? new Vector3(c.x, box.max.y, c.z)
        : anchor === 'back'
          ? new Vector3(c.x, c.y, box.min.z)
          : c;
  return p.negate();
}

/** Wrap a loaded scene so its scale and anchor are applied and the wrapper sits at the origin. */
export function fitModel(model: Object3D, scale = 1, anchor: ModelAnchor = 'center'): Group {
  const inner = new Group();
  inner.add(model);
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);
  model.position.copy(anchorOffset(new Box3().setFromObject(inner), anchor).divideScalar(scale));
  const outer = new Group();
  outer.add(inner);
  return outer;
}
