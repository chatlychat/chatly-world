import { Vector3, type Object3D } from 'three';

import { createWorld, type ChatlyWorld } from '../world.js';
import { fakeConversation, grid, viewerCamera, withBlocks } from './fake.js';

import type { WorldOptions } from '../types.js';

export const eq = { kind: 'text', text: 'Level 2.' } as const;

/** A world over a loaded thread whose latest message carries a grid. */
export function setup(
  over: Partial<WorldOptions> = {},
  placement = 'shelf',
  titles = ['Dunk', 'AF1', 'Jordan'],
) {
  const f = fakeConversation({ messages: [withBlocks('m1', [grid(placement, titles)])] });
  const camera = viewerCamera();
  const world = createWorld({ conversation: f.conv, camera, ...over });
  return { f, camera, world };
}

export const byName = (w: ChatlyWorld, name: string): Object3D[] => {
  const out: Object3D[] = [];
  w.root.traverse((o) => o.name === name && out.push(o));
  return out;
};

export const aimAt = (
  w: ChatlyWorld,
  camera: { getWorldPosition(v: Vector3): Vector3 },
  node: Object3D,
) => {
  const from = camera.getWorldPosition(new Vector3());
  return w.pick(from, node.getWorldPosition(new Vector3()).sub(from));
};
