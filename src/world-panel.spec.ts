import { Group, type Mesh, type MeshBasicMaterial, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { msg } from './test/fake.js';
import { aimAt, byName, setup } from './test/world-fixtures.js';
import { type ChatlyWorld } from './world.js';

describe('speech bubbles', () => {
  it('speaks only what arrives, never the history', () => {
    const { world } = setup();
    expect(byName(world, 'cl3-bubble')).toHaveLength(0);
  });

  it('anchors over the speaker, follows the speaker, and is never carried by the camera', () => {
    const speaker = new Group();
    speaker.position.set(2, 0, -3);
    const { world, f, camera } = setup({ anchors: { speaker: () => speaker } });
    f.push(msg({ id: 'n', body: 'Over here' }));
    const [b] = byName(world, 'cl3-bubble') as [Object3D];
    world.update(0.016);
    const home = b.position.clone();
    expect(home.x).toBeCloseTo(2, 6);
    expect(home.z).toBeCloseTo(-3, 6);
    expect(home.y).toBeGreaterThan(1.5);

    camera.position.set(-4, 1.6, 2);
    camera.updateMatrixWorld(true);
    world.update(0.016);
    // Not head-locked: the camera moved 4m and 3.6m and the bubble did not follow it
    // (its height shifts a little, because its stack offset scales with distance).
    expect(b.position.x).toBeCloseTo(home.x, 9);
    expect(b.position.z).toBeCloseTo(home.z, 9);
    expect(Math.abs(b.position.y - home.y)).toBeLessThan(0.15);

    speaker.position.set(0, 0, -6);
    world.update(0.016);
    expect(b.position.x).toBeCloseTo(0, 6);
    expect(b.position.z).toBeCloseTo(-6, 6);
  });

  it('scales with distance and turns to face the viewer', () => {
    const speaker = new Group();
    speaker.position.set(0, 0, -2);
    const { world, f, camera } = setup({ anchors: { speaker: () => speaker } });
    f.push(msg({ id: 'n', body: 'hi' }));
    const [b] = byName(world, 'cl3-bubble') as [Object3D];
    world.update(0.016);
    const near = b.scale.x;
    speaker.position.set(0, 0, -9);
    world.update(0.016);
    expect(b.scale.x).toBeGreaterThan(near);
    camera.position.set(5, 1.6, -9);
    camera.updateMatrixWorld(true);
    world.update(0.016);
    expect(b.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });

  it('expires after bubbleDurationMs, keeps at most three, and grows a streaming reply in place', () => {
    let t = 0;
    const { world, f } = setup({ now: () => t, theme: { bubbleDurationMs: 1000 } });
    f.push(
      msg({ id: 'a', body: 'one' }),
      msg({ id: 'b', body: 'two' }),
      msg({ id: 'c', body: 'three' }),
      msg({ id: 'd', body: 'four' }),
    );
    expect(byName(world, 'cl3-bubble')).toHaveLength(3);
    f.set({
      messages: f.conv
        .getSnapshot()
        .messages.map((m) => (m.id === 'd' ? { ...m, body: 'four, more' } : m)),
    });
    expect(byName(world, 'cl3-bubble').at(-1)?.getObjectByName('cl3-bubble-tail')).toBeDefined();
    const texts = byName(world, 'cl3-bubble').map(
      (b) => b.children.find((c) => c.userData['text'] !== undefined)?.userData['text'],
    );
    expect(texts).toEqual(['two', 'three', 'four, more']);
    t = 2000;
    world.update(0.016);
    expect(byName(world, 'cl3-bubble')).toHaveLength(0);
  });

  it('the visitor gets a bubble only if the host gave them an anchor', () => {
    const none = setup();
    none.f.push(msg({ id: 'v', authorType: 'contact', body: 'hello', authorId: null }));
    expect(byName(none.world, 'cl3-bubble')).toHaveLength(0);
    const avatar = new Group();
    const some = setup({ anchors: { visitor: avatar } });
    some.f.push(msg({ id: 'v', authorType: 'contact', body: 'hello', authorId: null }));
    expect(byName(some.world, 'cl3-bubble')).toHaveLength(1);
  });

  it('shows a typing indicator per typingLook, still under reduced motion', () => {
    const typing = { actorType: 'bot', actorId: 'bot-1', displayName: 'Mia', label: null } as const;
    const dots = setup();
    dots.f.set({ typing });
    expect(byName(dots.world, 'cl3-typing')[0]?.children).toHaveLength(3);
    dots.f.set({ typing: null });
    expect(byName(dots.world, 'cl3-typing')).toHaveLength(0);

    const pulse = setup({ theme: { typingLook: 'pulse' }, reducedMotion: true });
    pulse.f.set({ typing });
    const [t] = byName(pulse.world, 'cl3-typing') as [Object3D];
    expect(t.children).toHaveLength(1);
    pulse.world.update(0.5);
    pulse.world.update(0.5);
    expect(t.children[0]?.scale.x).toBe(1); // present, but not pulsing

    const none = setup({ theme: { typingLook: 'none' } });
    none.f.set({ typing });
    expect(byName(none.world, 'cl3-typing')).toHaveLength(0);
  });
});

describe('panel and composer', () => {
  it('is world-space: stays put in the dead zone, glides when the viewer walks off, never welded to the head', () => {
    const { world, camera } = setup();
    world.update(0.016);
    const rig = world.root.getObjectByName('cl3-panel-rig') as Object3D;
    const home = rig.position.clone();
    expect(home.z).toBeCloseTo(-1, 6); // 1 m ahead of the viewer
    camera.position.set(0.2, 1.6, 0);
    camera.updateMatrixWorld(true);
    world.update(0.016);
    expect(rig.position.distanceTo(home)).toBe(0);
    camera.position.set(3, 1.6, 0);
    camera.updateMatrixWorld(true);
    world.update(0.016);
    const mid = rig.position.clone();
    expect(mid.distanceTo(home)).toBeGreaterThan(0);
    for (let i = 0; i < 300; i += 1) {
      world.update(0.016);
    }
    expect(rig.position.x).toBeCloseTo(3, 1);
    expect(mid.x).toBeLessThan(rig.position.x);
  });

  it('a `locked` request is honoured as lazy, and says so', () => {
    const { world } = setup({ placement: { follow: 'locked' } });
    expect(world.placement.follow).toBe('lazy');
    expect(world.placement.changed.map((c) => c.field)).toContain('follow');
  });

  it('`fixed` never moves; `wrist` rides the host controller', () => {
    const fixed = setup({ follow: 'fixed' });
    fixed.world.update(0.016);
    const rig = fixed.world.root.getObjectByName('cl3-panel-rig') as Object3D;
    const at = rig.position.clone();
    fixed.camera.position.set(9, 1.6, 9);
    fixed.camera.updateMatrixWorld(true);
    fixed.world.update(0.016);
    expect(rig.position.distanceTo(at)).toBe(0);

    const wrist = new Group();
    const worn = setup({ follow: 'wrist', anchors: { wrist } });
    worn.world.update(0.016);
    expect(wrist.getObjectByName('cl3-panel-rig')).toBeDefined();
  });

  it('draws the thread, and the composer sends what the host types', async () => {
    const { world, f } = setup();
    f.push(msg({ id: 'n', body: 'Welcome in' }));
    const lines = (byName(world, 'cl3-panel')[0]?.children.find(
      (c) => c.userData['lines'] !== undefined,
    )?.userData['lines'] ?? []) as string[];
    expect(lines.join(' ')).toContain('Agent: Welcome in');

    world.composer.setDraft('Size M?');
    expect(f.calls.typing).toEqual([true]);
    expect(world.agent.presence).toBeNull();
    await world.composer.submit();
    expect(f.calls.sends).toEqual(['Size M?']);
    expect(world.composer.draft).toBe('');
    expect(f.calls.typing).toEqual([true, false]);
    await world.composer.submit(); // empty: nothing to send
    expect(f.calls.sends).toHaveLength(1);
  });

  it('the composer field asks the host for input; the send button submits', () => {
    const onComposeRequest = vi.fn();
    const { world, f, camera } = setup({ onComposeRequest });
    world.update(0.016);
    world.composer.setDraft('hello');
    const composer = byName(world, 'cl3-composer')[0] as Object3D;
    composer.updateMatrixWorld(true);
    const [field, send] = composer.children as [Object3D, Object3D];
    expect(aimAt(world, camera, field)?.kind).toBe('field');
    aimAt(world, camera, field)?.activate();
    expect(onComposeRequest).toHaveBeenCalledOnce();
    const h = aimAt(world, camera, send);
    expect(h?.kind).toBe('send');
    h?.activate();
    expect(f.calls.sends).toEqual(['hello']);
  });
});

describe('worldTheme', () => {
  it('applies the resolved scheme to the panel, and layers a room over the channel', () => {
    const light = setup();
    const dark = setup({ scene: 'dark' });
    const color = (w: ChatlyWorld): string | undefined => {
      const back = byName(w, 'cl3-panel')[0]?.getObjectByName('cl3-panel-backing') as
        | Mesh
        | undefined;
      return (back?.material as MeshBasicMaterial | undefined)?.color.getHexString();
    };
    expect(color(light.world)).toBe('ffffff');
    expect(color(dark.world)).toBe('111827');
    const room = setup({
      theme: { panelColor: '#112233' },
      themeLayers: [{ panelColor: '#445566' }],
    });
    expect(color(room.world)).toBe('445566');
  });

  it('panelMaterial:none and bubbleShape:none draw no plate', () => {
    const { world, f } = setup({ theme: { panelMaterial: 'none', bubbleShape: 'none' } });
    f.push(msg({ id: 'n', body: 'hi' }));
    expect(byName(world, 'cl3-panel')[0]?.getObjectByName('cl3-panel-backing')).toBeUndefined();
    expect(
      byName(world, 'cl3-bubble')[0]?.children.every((c) => c.userData['text'] !== undefined),
    ).toBe(true);
  });

  it('setTheme and setScene re-apply everywhere', () => {
    const { world } = setup();
    expect(byName(world, 'cl3-card-pedestal')).toHaveLength(0);
    world.setTheme({ cardPedestal: 'plinth' });
    expect(byName(world, 'cl3-card-pedestal')).toHaveLength(3);
    world.setScene('dark');
    expect(world.theme.scheme).toBe('dark');
  });
});
