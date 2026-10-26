import { Group, Mesh, MeshBasicMaterial, BoxGeometry, AnimationClip, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { fakeConversation, flush, msg, viewerCamera } from './test/fake.js';
import { byName, eq, setup } from './test/world-fixtures.js';
import { createWorld } from './world.js';

describe('reduced motion', () => {
  const themed = { motionEntrance: 'scale', cardTrail: true, motionPick: 'rise' } as const;

  it('beats the theme: no entrance, no trail, and the final frame at once', () => {
    const calm = setup({ theme: themed, reducedMotion: true });
    expect(calm.world.theme.motionEntrance).toBe('none');
    expect(calm.world.theme.cardTrail).toBe(false);
    expect(calm.world.theme.motionPick).toBe('none');
    expect(byName(calm.world, 'cl3-card')[0]?.scale.x).toBe(1);

    const lively = setup({ theme: themed });
    const card = byName(lively.world, 'cl3-card')[0] as Object3D;
    expect(card.scale.x).toBeLessThan(0.01); // mid-entrance
    lively.world.update(1);
    expect(card.scale.x).toBe(1);
  });

  it('can be turned on mid-flight — by call or by the host function — and wins immediately', () => {
    let on = false;
    const { world } = setup({ theme: themed, reducedMotion: () => on });
    expect(world.reducedMotion).toBe(false);
    on = true;
    world.update(0.016);
    expect(world.reducedMotion).toBe(true);
    expect(world.theme.motionEntrance).toBe('none');
    world.setReducedMotion(false);
    expect(world.theme.motionEntrance).toBe('scale');
  });

  it('a held pick appears in place, and a lazy panel snaps rather than glides', async () => {
    const { world, camera } = setup({ theme: themed, reducedMotion: true });
    await world.select('m1:k0');
    expect(byName(world, 'cl3-pick')).toHaveLength(1);
    world.update(0.016);
    const rig = world.root.getObjectByName('cl3-panel-rig') as Object3D;
    camera.position.set(5, 1.6, 0);
    camera.updateMatrixWorld(true);
    world.update(0.016);
    expect(rig.position.x).toBeCloseTo(5, 6);
  });

  it('the agent holds a pose instead of looping, plays no expression clip, and turns instantly', async () => {
    const talk = new AnimationClip('Talk', 1, []);
    const wave = new AnimationClip('Wave', 1, []);
    const mk = (reducedMotion: boolean) => {
      const f = fakeConversation({ messages: [msg({ id: 'h', body: 'hi' })] });
      const world = createWorld({
        conversation: f.conv,
        camera: viewerCamera(),
        reducedMotion,
        presences: {
          '*': {
            name: 'Mia',
            avatar: { url: 'https://cdn.test/mia.glb' },
            clips: { speaking: 'Talk' },
            expressions: { wave: 'Wave' },
          },
        },
        loadModel: () => Promise.resolve({ scene: new Group(), animations: [talk, wave] }),
      });
      return { f, world };
    };
    for (const reduced of [true, false]) {
      const { f, world } = mk(reduced);
      await flush();
      f.push(
        msg({
          id: 's',
          body: 'talking',
          streamState: 'streaming',
          metadata: { embodiment: { expression: 'wave', lookAt: { target: 'visitor' } } },
        }),
      );
      expect(world.agent.activeClip).toBe('Talk');
      expect(world.agent.playExpression('Wave')).toBe(!reduced);
      world.agent.root.position.set(3, 0, -3);
      world.update(0.016);
      // The visitor is at the origin: the agent should face -45 degrees. Reduced motion
      // is there at once; otherwise it has turned only one frame's worth (6 rad/s).
      expect(world.agent.root.rotation.y).toBeCloseTo(reduced ? -Math.PI / 4 : -0.096, 3);
    }
  });
});

describe('embodied agent', () => {
  it('derives state from the thread, announces it, and starts from a placeholder body', () => {
    const said: string[] = [];
    const { world, f } = setup({
      announce: (t) => said.push(t),
      presences: { '*': { name: 'Mia', description: 'a guide' } },
    });
    expect(world.agent.root.getObjectByName('cl3-agent-placeholder')).toBeDefined();
    f.set({ typing: { actorType: 'bot', actorId: 'bot-1', displayName: 'Mia', label: null } });
    expect(said).toContain('Agent: Mia (a guide) — thinking');
    expect(world.agent.root.getObjectByName('cl3-agent-nametag')?.userData['text']).toBe('Mia');
  });

  it('a usdz avatar is refused with a typed error and the placeholder stays', () => {
    const onError = vi.fn();
    setup({
      onError,
      presences: {
        '*': { name: 'Mia', avatar: { url: 'https://cdn.test/mia.usdz', format: 'usdz' } },
      },
    });
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'unsupported_format' });
  });

  it('drives the mouth from visemes when the message carries them, and closes it after', async () => {
    const mouth = Object.assign(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), {
      morphTargetDictionary: { viseme_aa: 0, viseme_oh: 1, blink: 2 },
      morphTargetInfluences: [0, 0, 0.7],
    });
    const scene = new Group();
    scene.add(mouth);
    let t = 0;
    const f = fakeConversation({ messages: [msg({ id: 'h', body: 'hi' })] });
    const world = createWorld({
      conversation: f.conv,
      camera: viewerCamera(),
      now: () => t,
      presences: {
        '*': { name: 'Mia', avatar: { url: 'https://cdn.test/mia.vrm', format: 'vrm' } },
      },
      loadModel: () => Promise.resolve({ scene, animations: [] }),
    });
    await flush();
    f.push(
      msg({
        id: 's',
        body: 'ahh',
        metadata: {
          visemes: [
            { t: 0, v: 'aa' },
            { t: 200, v: 'oh', w: 0.5 },
          ],
        },
      }),
    );
    world.update(0.016);
    expect(mouth.morphTargetInfluences).toEqual([1, 0, 0.7]);
    t = 250;
    world.update(0.016);
    expect(mouth.morphTargetInfluences).toEqual([0, 0.5, 0.7]); // blink untouched
    t = 5000;
    world.update(0.016);
    expect(mouth.morphTargetInfluences).toEqual([0, 0, 0.7]);
  });

  it('a message with no visemes leaves the mouth alone', async () => {
    const f = fakeConversation({ messages: [msg({ id: 'h', body: 'hi' })] });
    const world = createWorld({ conversation: f.conv, camera: viewerCamera() });
    f.push(msg({ id: 's', body: 'plain' }));
    expect(() => world.update(0.016)).not.toThrow();
  });

  it('lookAt resolves named refs through the host and turns the body there', () => {
    const shop = new Group();
    shop.position.set(5, 0, 0);
    const { world, f } = setup({ anchors: { resolve: (r) => (r === 'shop' ? shop : null) } });
    f.push(
      msg({
        id: 'n',
        body: 'There',
        metadata: { embodiment: { lookAt: { target: 'place', ref: 'shop' } } },
      }),
    );
    world.update(1);
    expect(world.agent.root.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('capabilities through the world', () => {
  it('a bot-fired invocation reaches the host handler and is answered into the thread', async () => {
    const { world, f } = setup();
    const walk = vi.fn();
    world.capabilities.register('world.walk_to', walk, { equivalent: eq, unprompted: true });
    f.fire({ capability: 'world.walk_to', args: { place: 'shop' } });
    await flush();
    expect(walk).toHaveBeenCalledOnce();
    expect(f.calls.reports[0]).toMatchObject({ status: 'done', actionId: 'inv-1' });
  });
});

describe('lifecycle', () => {
  it('dispose stops listening and takes the world out of the scene', () => {
    const scene = new Group();
    const { world, f } = setup();
    scene.add(world.root);
    world.dispose();
    expect(world.root.parent).toBeNull();
    f.push(msg({ id: 'late', body: 'ignored' }));
    expect(byName(world, 'cl3-bubble')).toHaveLength(0);
  });
});
