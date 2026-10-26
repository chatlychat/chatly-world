/**
 * Speech bubbles, anchored to a speaker in space.
 *
 * A bubble is positioned from its SPEAKER'S world position — never from the
 * camera, so it cannot be head-locked — and only turned to face the viewer.
 * Its size grows with distance (clamped) so type stays legible across a room,
 * which is why the text itself is built at one size and the whole bubble is
 * scaled.
 */
import {
  Box3,
  ConeGeometry,
  Group,
  Mesh,
  SphereGeometry,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';

import { createTextMesh } from './text.js';
import { accentMaterial, bubbleBacking } from './theme-apply.js';
import { WORLD_CONTRACT } from './types.js';

import type { BubbleRenderProps, ConversationMessage, ResolvedWorldTheme } from '@chatlychat/core';

const REFERENCE_METRES = 2;
const SCALE_MIN = 0.6;
const SCALE_MAX = 2.5;
const HEAD_FALLBACK = 1.9;
const STACK_STEP = 0.22;
export const MAX_BUBBLES = 3;

/** Uniform scale for a bubble `distance` metres from the viewer. */
export const bubbleScale = (distance: number): number =>
  Math.min(SCALE_MAX, Math.max(SCALE_MIN, distance / REFERENCE_METRES));

export function defaultBubble(props: BubbleRenderProps): Object3D {
  const { theme } = props;
  const g = new Group();
  g.name = WORLD_CONTRACT.objects.bubble;
  const text = createTextMesh(props.message.body, theme, {
    maxWidthMetres: theme.bubbleMaxWidthMetres,
  });
  const [w, h] = text.userData['size'] as [number, number];
  const pad = 0.03;
  const plate = bubbleBacking(theme, w + pad * 2, h + pad * 2);
  if (plate !== null) {
    g.add(plate);
    if (theme.bubbleTail && theme.bubbleShape !== 'cloud') {
      const tail = new Mesh(new ConeGeometry(0.025, 0.05, 3), plate.material);
      tail.name = 'cl3-bubble-tail';
      tail.position.set(0, -(h / 2 + pad + 0.02), 0);
      tail.rotation.set(0, 0, Math.PI);
      g.add(tail);
    }
  }
  text.position.z = 0.002;
  g.add(text);
  g.userData['size'] = [w + pad * 2, h + pad * 2];
  return g;
}

/** The typing indicator: three dots, one pulsing dot, or nothing (`avatar`/`none` live on the body). */
export function createTyping(theme: ResolvedWorldTheme): Group {
  const g = new Group();
  g.name = WORLD_CONTRACT.objects.typing;
  g.userData['look'] = theme.typingLook;
  const dots = theme.typingLook === 'dots' ? 3 : theme.typingLook === 'pulse' ? 1 : 0;
  for (let i = 0; i < dots; i += 1) {
    const d = new Mesh(new SphereGeometry(0.02, 12, 8), accentMaterial(theme));
    d.position.x = (i - (dots - 1) / 2) * 0.06;
    g.add(d);
  }
  return g;
}

/** Bob or pulse the dots. With reduced motion they sit still: a static ellipsis still says "typing". */
export function animateTyping(typing: Object3D, nowMs: number, reduced: boolean): void {
  if (reduced) {
    typing.children.forEach((c) => {
      c.position.y = 0;
      c.scale.setScalar(1);
    });
    return;
  }
  const pulse = typing.userData['look'] === 'pulse';
  typing.children.forEach((c, i) => {
    const phase = nowMs / 300 - i * 0.6;
    if (pulse) {
      c.scale.setScalar(1 + 0.4 * Math.sin(phase));
    } else {
      c.position.y = 0.015 * Math.sin(phase);
    }
  });
}

/** World-space point above a speaker's head. */
export function headPoint(speaker: Object3D): Vector3 {
  speaker.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(speaker);
  const p = speaker.getWorldPosition(new Vector3());
  return box.isEmpty() ? p.setY(p.y + HEAD_FALLBACK) : new Vector3(p.x, box.max.y + 0.2, p.z);
}

export interface LiveBubble {
  readonly messageId: string;
  readonly speaker: Object3D;
  node: Object3D;
  body: string;
  readonly bornAt: number;
}

/**
 * Re-anchor `node` over `speaker`: stack slot `slot` above the head, turned to
 * the camera, scaled by distance. Called every frame, so a walking speaker
 * carries its bubble.
 */
export function anchorBubble(
  node: Object3D,
  speaker: Object3D,
  camera: Camera,
  slot: number,
  parent: Object3D,
): void {
  const head = headPoint(speaker);
  const cam = camera.getWorldPosition(new Vector3());
  const scale = bubbleScale(head.distanceTo(cam));
  head.y += (slot * STACK_STEP + 0.1) * scale;
  parent.worldToLocal(head);
  node.position.copy(head);
  const camLocal = parent.worldToLocal(cam.clone());
  node.rotation.set(0, Math.atan2(camLocal.x - head.x, camLocal.z - head.z), 0);
  node.scale.setScalar(scale);
}

export const speakerKind = (m: ConversationMessage): 'visitor' | 'agent' | null =>
  m.authorType === 'contact'
    ? 'visitor'
    : m.authorType === 'agent' || m.authorType === 'bot'
      ? 'agent'
      : null;
