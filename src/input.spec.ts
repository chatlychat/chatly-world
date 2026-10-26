import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { fakeConversation, flush, grid, viewerCamera, withBlocks } from './test/fake.js';
import { createWorld } from './world.js';

// One shelf, three cards: the first at x = -0.35, 1.4m ahead of a viewer at the origin.
function shelf() {
  const f = fakeConversation({
    messages: [withBlocks('m1', [grid('shelf', ['Dunk', 'AF1', 'Jordan'])])],
  });
  const camera = viewerCamera();
  return { f, camera, world: createWorld({ conversation: f.conv, camera }) };
}

describe('hand, controller and gaze input', () => {
  it('a controller `select` picks what it points at', async () => {
    const { world, f } = shelf();
    const controller = new Group();
    controller.position.set(-0.35, 1.6, 0); // points down -z by default
    const off = world.attachController(controller);
    (controller as unknown as { dispatchEvent(e: { type: string }): void }).dispatchEvent({
      type: 'select',
    });
    await flush();
    expect(world.selection.id).toBe('m1:k0');
    expect(f.calls.postbacks).toHaveLength(1);
    off();
    world.release();
    (controller as unknown as { dispatchEvent(e: { type: string }): void }).dispatchEvent({
      type: 'select',
    });
    expect(world.selection.id).toBeNull();
  });

  it('a controller pointing at nothing does nothing', () => {
    const { world } = shelf();
    const controller = new Object3D();
    controller.position.set(0, 1.6, 0);
    controller.rotation.y = Math.PI; // away from the shelf
    world.attachController(controller);
    (controller as unknown as { dispatchEvent(e: { type: string }): void }).dispatchEvent({
      type: 'select',
    });
    expect(world.selection.id).toBeNull();
  });

  it('gaze activates after the dwell, shows progress, and resets when the eyes move off', async () => {
    const { world, camera } = shelf();
    camera.position.set(-0.35, 1.6, 0);
    camera.updateMatrixWorld(true);
    const gaze = world.attachGaze({ dwellMs: 1000 });
    gaze.update(400);
    gaze.update(400);
    expect(gaze.progress).toBeCloseTo(0.4, 6); // the first frame only locks on
    camera.position.set(9, 1.6, 0);
    camera.updateMatrixWorld(true);
    gaze.update(400);
    expect(gaze.progress).toBe(0);
    camera.position.set(-0.35, 1.6, 0);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 4; i += 1) {
      gaze.update(400);
    }
    await flush();
    expect(world.selection.id).toBe('m1:k0');
  });

  it('a mouse or touch ray through the camera picks too', async () => {
    const { world } = shelf();
    // Dead centre looks straight at the middle card, through the (unmarked) panel plate in front of it.
    const hit = world.pickAtPointer(0, 0);
    expect(hit?.kind).toBe('card');
    hit?.activate();
    await flush();
    expect(world.selection.id).toBe('m1:k1');
  });
});
