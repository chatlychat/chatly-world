/**
 * VRM avatars, with no GL and no real model. The fake below has the shape of
 * three-vrm's documented `VRM` (expressionManager.setValue, lookAt.target,
 * humanoid.getNormalizedBoneNode, update) —
 * https://pixiv.github.io/three-vrm/packages/three-vrm/docs/classes/VRM.html —
 * and the last spec checks the REAL package still exports what the loader needs.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { gltfLoader, type GltfLoaderLike } from './model.js';
import { fakeConversation, flush, msg, viewerCamera } from './test/fake.js';
import { WorldError } from './types.js';
import {
  EXPRESSION_TO_VRM,
  VISEME_TO_VRM,
  VRM_VOWELS,
  hasVrmExtension,
  loadVrmModule,
  vrmVisemeFor,
  wantsVrm,
  type VrmLike,
  type VrmModule,
} from './vrm.js';
import { createWorld } from './world.js';

function fakeVrm() {
  const values: Record<string, number> = {};
  const head = new Group();
  const scene = new Group();
  scene.add(head);
  head.position.set(0, 1.5, 0);
  const lookAt: { target: Group | null } = { target: null };
  const update = vi.fn();
  const vrm = {
    scene,
    expressionManager: {
      setValue: (n: string, w: number) => {
        values[n] = w;
      },
    },
    lookAt,
    humanoid: { getNormalizedBoneNode: (n: string) => (n === 'head' ? head : null) },
    update,
  } satisfies VrmLike & { lookAt: typeof lookAt };
  return { vrm, values, head, update, lookAt };
}

class FakePlugin {
  public constructor(public readonly parser: unknown) {}
}
const fakeModule = (): VrmModule => ({ VRMLoaderPlugin: FakePlugin });

describe('viseme -> VRM mapping', () => {
  it('maps the five VRM vowels to themselves and the Oculus vowels to their shapes', () => {
    for (const v of VRM_VOWELS) {
      expect(vrmVisemeFor(v)).toEqual([v, 1]);
    }
    expect(vrmVisemeFor('E')?.[0]).toBe('ee');
    expect(vrmVisemeFor('I')?.[0]).toBe('ih');
    expect(vrmVisemeFor('O')?.[0]).toBe('oh');
    expect(vrmVisemeFor('U')?.[0]).toBe('ou');
    expect(vrmVisemeFor('viseme_aa')?.[0]).toBe('aa');
    expect(vrmVisemeFor('Viseme_O')?.[0]).toBe('oh');
  });

  it('opens a consonant shallower than a vowel, and closes the mouth for PP, sil and the unknown', () => {
    for (const k of Object.keys(VISEME_TO_VRM)) {
      const m = VISEME_TO_VRM[k] ?? null;
      expect(m === null || (m[1] > 0 && m[1] <= 1)).toBe(true);
    }
    expect(vrmVisemeFor('FF')?.[1]).toBeLessThan(1);
    expect(vrmVisemeFor('PP')).toBeNull();
    expect(vrmVisemeFor('sil')).toBeNull();
    expect(vrmVisemeFor('zzz')).toBeNull();
  });
});

describe('expression presets', () => {
  it('maps the cues that have a VRM preset, and none of the gestures', () => {
    expect(EXPRESSION_TO_VRM).toEqual({
      smile: ['happy', 0.7],
      laugh: ['happy', 1],
      surprised: ['surprised', 1],
      concerned: ['sad', 0.6],
    });
    for (const g of ['nod', 'shake_head', 'point', 'wave', 'shrug', 'think'] as const) {
      expect(EXPRESSION_TO_VRM[g]).toBeUndefined();
    }
  });
});

describe('selecting the VRM path', () => {
  it('by declared format, or by the extension in the file; never for a plain glTF', () => {
    expect(wantsVrm('vrm')).toBe(true);
    expect(wantsVrm('gltf')).toBe(false);
    expect(wantsVrm(undefined)).toBe(false);
    expect(wantsVrm(undefined, { userData: { gltfExtensions: { VRM: {} } } })).toBe(true);
    expect(wantsVrm('gltf', { userData: { gltfExtensions: { VRMC_vrm: {} } } })).toBe(true);
    expect(hasVrmExtension({ parser: { json: { extensionsUsed: ['VRMC_vrm'] } } })).toBe(true);
    expect(hasVrmExtension({ userData: { gltfExtensions: { KHR_materials_unlit: {} } } })).toBe(
      false,
    );
    expect(hasVrmExtension({})).toBe(false);
  });

  const setupLoader = (gltfs: Array<{ userData?: Record<string, unknown> }>) => {
    const f = fakeVrm();
    const registered: unknown[] = [];
    const loadAsync = vi.fn();
    gltfs.forEach((g) =>
      loadAsync.mockResolvedValueOnce({ scene: new Group(), animations: [], ...g }),
    );
    const createLoader = vi.fn(
      (): Promise<GltfLoaderLike> =>
        Promise.resolve({
          register: (p) => registered.push(p(null)),
          loadAsync,
        }),
    );
    const loadVrm = vi.fn(() => Promise.resolve(fakeModule()));
    return { f, registered, loadAsync, createLoader, loadVrm };
  };

  it('format "vrm" loads through VRMLoaderPlugin and returns the VRM', async () => {
    const t = setupLoader([{ userData: {} }]);
    t.loadAsync.mockReset();
    const { vrm } = t.f;
    t.loadAsync.mockResolvedValueOnce({ scene: vrm.scene, animations: [], userData: { vrm } });
    const load = gltfLoader({ loadVrm: t.loadVrm, createLoader: t.createLoader });
    const m = await load('https://cdn.test/mia.vrm', { format: 'vrm' });
    expect(t.loadVrm).toHaveBeenCalledOnce();
    expect(t.registered[0]).toBeInstanceOf(FakePlugin);
    expect(m.vrm).toBe(vrm);
    expect(m.scene).toBe(vrm.scene);
  });

  it('an unlabelled file with the VRM extension is reloaded through the plugin', async () => {
    const f = fakeVrm();
    const t = setupLoader([{ userData: { gltfExtensions: { VRMC_vrm: {} } } }]);
    t.loadAsync.mockResolvedValueOnce({
      scene: f.vrm.scene,
      animations: [],
      userData: { vrm: f.vrm },
    });
    const load = gltfLoader({ loadVrm: t.loadVrm, createLoader: t.createLoader });
    const m = await load('https://cdn.test/mia.glb');
    expect(t.loadAsync).toHaveBeenCalledTimes(2);
    expect(m.vrm).toBe(f.vrm);
  });

  it('CONTROL: a plain glTF never touches three-vrm', async () => {
    const t = setupLoader([{ userData: {} }]);
    const load = gltfLoader({ loadVrm: t.loadVrm, createLoader: t.createLoader });
    const m = await load('https://cdn.test/shoe.glb', { format: 'gltf' });
    await load('https://cdn.test/shoe.glb');
    expect(t.loadVrm).not.toHaveBeenCalled();
    expect(t.registered).toHaveLength(0);
    expect(m.vrm).toBeUndefined();
  });

  it('a declared VRM with no VRM data in it comes back as the plain glTF', async () => {
    const t = setupLoader([{ userData: {} }]);
    const load = gltfLoader({ loadVrm: t.loadVrm, createLoader: t.createLoader });
    expect((await load('https://cdn.test/x.vrm', { format: 'vrm' })).vrm).toBeUndefined();
  });
});

describe('the missing optional peer', () => {
  it('is a typed error that names the package, the install and the bundler escape hatch', async () => {
    const err = await loadVrmModule(() => Promise.reject(new Error('Cannot find package'))).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(WorldError);
    expect(err).toMatchObject({ code: 'missing_peer' });
    expect((err as Error).message).toContain('@pixiv/three-vrm');
    expect((err as Error).message).toContain('npm install @pixiv/three-vrm');
    expect((err as Error).message).toContain('loadVrm');
  });

  it('a module that is not three-vrm is refused the same way', async () => {
    await expect(
      loadVrmModule(() => Promise.resolve({} as unknown as VrmModule)),
    ).rejects.toMatchObject({ code: 'missing_peer' });
  });

  it('reaches onError and leaves the placeholder body when an avatar needs it', async () => {
    const onError = vi.fn();
    const f = fakeConversation({ messages: [msg({ id: 'h', body: 'hi' })] });
    const world = createWorld({
      conversation: f.conv,
      camera: viewerCamera(),
      onError,
      loadVrm: () => Promise.reject(new Error('nope')),
      presences: {
        '*': { name: 'Mia', avatar: { url: 'https://cdn.test/mia.vrm', format: 'vrm' } },
      },
    });
    await flush();
    await flush();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'missing_peer' });
    expect(world.agent.hasModel).toBe(false);
  });

  it('the real package exports what the loader needs', async () => {
    const real = (await import('@pixiv/three-vrm')) as unknown as VrmModule;
    expect(typeof real.VRMLoaderPlugin).toBe('function');
    expect(typeof real.VRMUtils?.rotateVRM0).toBe('function');
    await expect(loadVrmModule()).resolves.toHaveProperty('VRMLoaderPlugin');
  });
});

describe('a VRM agent in the world', () => {
  async function vrmWorld(over: { reducedMotion?: boolean; morph?: boolean } = {}) {
    const f = fakeVrm();
    const morph = Object.assign(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), {
      morphTargetDictionary: { viseme_aa: 0, aa: 1 },
      morphTargetInfluences: [0, 0],
    });
    f.vrm.scene.add(morph);
    let t = 0;
    const conv = fakeConversation({ messages: [msg({ id: 'h', body: 'hi' })] });
    const camera = viewerCamera();
    const world = createWorld({
      conversation: conv.conv,
      camera,
      now: () => t,
      reducedMotion: over.reducedMotion ?? false,
      presences: {
        '*': { name: 'Mia', avatar: { url: 'https://cdn.test/mia.vrm', format: 'vrm' } },
      },
      loadModel: () => Promise.resolve({ scene: f.vrm.scene, animations: [], vrm: f.vrm }),
    });
    await flush();
    return {
      ...f,
      morph,
      world,
      conv,
      camera,
      at: (ms: number) => {
        t = ms;
      },
    };
  }

  it('drives the mouth through expression bindings, not morph targets, and closes it', async () => {
    const w = await vrmWorld();
    expect(w.world.agent.isVrm).toBe(true);
    w.conv.push(
      msg({
        id: 's',
        body: 'oh',
        metadata: {
          visemes: [
            { t: 0, v: 'O' },
            { t: 200, v: 'FF', w: 0.5 },
          ],
        },
      }),
    );
    w.world.update(0.016);
    expect(w.values).toMatchObject({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 1 });
    w.at(250);
    w.world.update(0.016);
    expect(w.values['ih']).toBeCloseTo(0.2, 5); // FF = ih at 0.4, times the track's 0.5
    expect(w.values['oh']).toBe(0);
    w.at(5000);
    w.world.update(0.016);
    expect(w.values).toMatchObject({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
    expect(w.morph.morphTargetInfluences).toEqual([0, 0]); // the morph path is not used
  });

  it('calls vrm.update with the frame delta on every update', async () => {
    const w = await vrmWorld();
    w.world.update(0.016);
    w.world.update(0.032);
    expect(w.update.mock.calls.map((c) => c[0])).toEqual([0.016, 0.032]);
  });

  it('shows a preset face for smile and fades it out; a gesture sets none', async () => {
    const w = await vrmWorld();
    const cue = (id: string, expression: string) =>
      w.conv.push(msg({ id, body: id, metadata: { embodiment: { expression } } }));
    cue('a', 'wave');
    w.world.update(0.2);
    expect(w.values['happy']).toBeUndefined();
    cue('b', 'smile');
    w.world.update(0.2); // past the 0.12s ease-in
    expect(w.values['happy']).toBeCloseTo(0.7, 5);
    w.world.update(3); // held 2.5s, then 0.5s fade: gone
    expect(w.values['happy']).toBe(0);
    cue('c', 'concerned');
    w.world.update(0.2);
    expect(w.values['sad']).toBeCloseTo(0.6, 5);
  });

  it('blinks on its own, but not under reduced motion', async () => {
    const w = await vrmWorld();
    w.world.update(0.075); // mid-blink
    expect(w.values['blink']).toBeGreaterThan(0.9);
    w.world.update(0.5);
    expect(w.values['blink']).toBe(0);
    const r = await vrmWorld({ reducedMotion: true });
    r.world.update(0.075);
    expect(r.values['blink']).toBe(0);
  });

  it('reduced motion applies a face without easing', async () => {
    const w = await vrmWorld({ reducedMotion: true });
    w.conv.push(msg({ id: 'x', body: 'x', metadata: { embodiment: { expression: 'laugh' } } }));
    w.world.update(0.001);
    expect(w.values['happy']).toBe(1);
  });

  it('lookAt: points VRM lookAt at the target and turns the head bone toward it', async () => {
    const w = await vrmWorld();
    const shop = new Group();
    shop.position.set(0, 3, 4);
    const w2 = createWorld({
      conversation: w.conv.conv,
      camera: w.camera,
      anchors: { resolve: () => shop },
      presences: {
        '*': { name: 'Mia', avatar: { url: 'https://cdn.test/mia.vrm', format: 'vrm' } },
      },
      loadModel: () => Promise.resolve({ scene: w.vrm.scene, animations: [], vrm: w.vrm }),
    });
    await flush();
    w.conv.push(
      msg({
        id: 'l',
        body: 'There',
        metadata: { embodiment: { lookAt: { target: 'place', ref: 'shop' } } },
      }),
    );
    for (let i = 0; i < 30; i += 1) {
      w2.update(0.05);
    }
    expect(w.lookAt.target).not.toBeNull();
    expect(w.lookAt.target?.position.y).toBe(3);
    expect(w.head.rotation.x).toBeLessThan(-0.1); // pitched up toward y=3 from the head at 1.5
  });

  it('CONTROL: a glTF avatar keeps the morph-target mouth and has no VRM rig', async () => {
    const mouth = Object.assign(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), {
      morphTargetDictionary: { viseme_aa: 0, viseme_oh: 1 },
      morphTargetInfluences: [0, 0],
    });
    const scene = new Group();
    scene.add(mouth);
    const conv = fakeConversation({ messages: [msg({ id: 'h', body: 'hi' })] });
    const world = createWorld({
      conversation: conv.conv,
      camera: viewerCamera(),
      now: () => 0,
      presences: { '*': { name: 'Mia', avatar: { url: 'https://cdn.test/mia.glb' } } },
      loadModel: () => Promise.resolve({ scene, animations: [] }),
    });
    await flush();
    conv.push(msg({ id: 's', body: 'a', metadata: { visemes: [{ t: 0, v: 'aa' }] } }));
    world.update(0.016);
    expect(world.agent.isVrm).toBe(false);
    expect(mouth.morphTargetInfluences).toEqual([1, 0]);
  });
});
