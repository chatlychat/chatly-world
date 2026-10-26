/**
 * The world-space panel and its composer, and how they follow the viewer.
 *
 * A panel is NEVER head-locked. A surface welded to the head is nauseating
 * within seconds, so a `locked` placement is honoured as `lazy` — the host
 * abilities the world resolves against simply do not offer it. The three
 * modes are:
 *
 *  - `fixed`: placed once, where the viewer was looking, and left there;
 *  - `lazy`: left alone until the viewer turns or walks past a dead zone, then
 *    eased into place (snapped, with reduced motion);
 *  - `wrist`: carried on a host-supplied controller or hand.
 */
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';

import { interactive } from './input.js';
import { createTextMesh } from './text.js';
import { panelBacking } from './theme-apply.js';
import { WORLD_CONTRACT } from './types.js';

import type { PanelFollow } from './types.js';
import type {
  ComposerRenderProps,
  PanelRenderProps,
  ResolvedWorldPlacement,
} from '@chatlychat/core';

/** ─────────────────────────── follow math (pure) ─────────────────────────── */

export interface FollowPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

export interface FollowState extends FollowPose {
  readonly chasing: boolean;
}

export const DEAD_YAW = (35 * Math.PI) / 180;
export const DEAD_METRES = 0.5;
const STOP_YAW = (2 * Math.PI) / 180;
const STOP_METRES = 0.03;
const RATE_PER_S = 4;

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One step of lazy follow, with hysteresis: the panel stays put until the
 * viewer leaves the dead zone, then chases until it has all but arrived, so it
 * never creeps on every small head movement.
 */
export function lazyStep(
  cur: FollowState,
  want: FollowPose,
  dtMs: number,
  reduced: boolean,
): FollowState {
  const dx = want.x - cur.x;
  const dy = want.y - cur.y;
  const dz = want.z - cur.z;
  const dist = Math.hypot(dx, dy, dz);
  const dyaw = wrapAngle(want.yaw - cur.yaw);
  const chasing = cur.chasing || Math.abs(dyaw) > DEAD_YAW || dist > DEAD_METRES;
  if (!chasing) {
    return cur;
  }
  if (reduced) {
    return { ...want, chasing: false };
  }
  const k = 1 - Math.exp((-RATE_PER_S * dtMs) / 1000);
  const next = { x: cur.x + dx * k, y: cur.y + dy * k, z: cur.z + dz * k, yaw: cur.yaw + dyaw * k };
  const arrived = dist * (1 - k) < STOP_METRES && Math.abs(dyaw) * (1 - k) < STOP_YAW;
  return { ...next, chasing: !arrived };
}

/** The follow mode a resolved placement means. `locked` never survives resolution, but be sure. */
export function followMode(placement: ResolvedWorldPlacement, override?: PanelFollow): PanelFollow {
  return override ?? (placement.follow === 'none' ? 'fixed' : 'lazy');
}

export interface RigContext {
  readonly camera: Camera;
  readonly reduced: boolean;
  readonly agent: Object3D | null;
  readonly place: Object3D | Vector3 | null;
  readonly wrist: Object3D | null;
}

const WRIST_WIDTH = 0.3;

/** Holds the panel + composer group and moves it per the follow mode. */
export class PanelRig {
  public readonly group = new Group();
  private state: FollowState = { x: 0, y: 0, z: 0, yaw: 0, chasing: false };
  private placed = false;
  private wristed: Object3D | null = null;

  public constructor(
    private readonly parent: Object3D,
    private readonly placement: ResolvedWorldPlacement,
    private mode: PanelFollow,
  ) {
    this.group.name = 'cl3-panel-rig';
    parent.add(this.group);
  }

  public get follow(): PanelFollow {
    return this.mode;
  }

  /** Where the placement wants the panel, in parent-local space. */
  private want(ctx: RigContext): FollowPose {
    const p = this.placement;
    const cam = ctx.camera.getWorldPosition(new Vector3());
    const dir = ctx.camera.getWorldDirection(new Vector3());
    const fwd = new Vector3(dir.x, 0, dir.z);
    if (fwd.lengthSq() < 1e-6) {
      fwd.set(0, 0, -1);
    }
    fwd.normalize();
    let pos: Vector3;
    if (p.anchor === 'agent' && ctx.agent !== null) {
      const a = ctx.agent.getWorldPosition(new Vector3());
      const toCam = new Vector3(cam.x - a.x, 0, cam.z - a.z).normalize();
      pos = a.add(toCam.multiplyScalar(p.distanceMetres)).setY(a.y + 1.4 + p.heightMetres);
    } else if (p.anchor === 'place' && ctx.place !== null) {
      const o =
        ctx.place instanceof Vector3
          ? ctx.place.clone()
          : ctx.place.getWorldPosition(new Vector3());
      pos = o.setY(o.y + 1.2 + p.heightMetres);
    } else if (p.anchor === 'world') {
      pos = this.parent.getWorldPosition(new Vector3());
      pos.y += 1.4 + p.heightMetres;
      pos.z -= p.distanceMetres;
    } else {
      pos = cam.clone().addScaledVector(fwd, p.distanceMetres);
      pos.y = cam.y + p.heightMetres;
    }
    this.parent.worldToLocal(pos);
    const camLocal = this.parent.worldToLocal(cam.clone());
    const yaw =
      p.billboard === 'none' && this.placed
        ? this.state.yaw
        : Math.atan2(camLocal.x - pos.x, camLocal.z - pos.z);
    return { x: pos.x, y: pos.y, z: pos.z, yaw };
  }

  public update(dtMs: number, ctx: RigContext): void {
    if (this.mode === 'wrist' && ctx.wrist !== null) {
      if (this.wristed !== ctx.wrist) {
        ctx.wrist.add(this.group);
        this.wristed = ctx.wrist;
        this.group.position.set(0, 0.12, -0.05);
        this.group.rotation.set(-Math.PI / 3, 0, 0);
        this.group.scale.setScalar(WRIST_WIDTH / this.placement.widthMetres);
      }
      return;
    }
    if (this.wristed !== null) {
      // The wrist went away: come back into the scene rather than vanish with it.
      this.parent.add(this.group);
      this.group.scale.setScalar(1);
      this.group.rotation.set(0, 0, 0);
      this.wristed = null;
      this.placed = false;
    }
    const want = this.want(ctx);
    if (!this.placed) {
      this.state = { ...want, chasing: false };
      this.placed = true;
    } else if (this.mode === 'lazy') {
      this.state = lazyStep(this.state, want, dtMs, ctx.reduced);
    }
    this.group.position.set(this.state.x, this.state.y, this.state.z);
    this.group.rotation.set(0, this.state.yaw, 0);
  }
}

/** ─────────────────────────── default renderers ─────────────────────────── */

const MAX_LINES = 6;
export const PANEL_LABELS = { you: 'You', agent: 'Agent', typing: 'is typing…' } as const;

export function defaultPanel(props: PanelRenderProps): Object3D {
  const { theme, placement } = props;
  const width = placement.widthMetres;
  const lines = props.messages
    .filter(
      (m) =>
        m.deletedAt === null && !m.hiddenFromContact && m.kind !== 'system_event' && m.body !== '',
    )
    .slice(-MAX_LINES)
    .map((m) => `${m.authorType === 'contact' ? PANEL_LABELS.you : PANEL_LABELS.agent}: ${m.body}`);
  if (props.typing !== null) {
    lines.push(`${props.typing.displayName ?? PANEL_LABELS.agent} ${PANEL_LABELS.typing}`);
  }
  const g = new Group();
  g.name = WORLD_CONTRACT.objects.panel;
  const text = createTextMesh(lines.join('\n'), theme, { maxWidthMetres: width - 0.04 });
  const [, th] = text.userData['size'] as [number, number];
  const height = th + 0.04;
  const back = panelBacking(theme, width, height);
  if (back !== null) {
    g.add(back);
  }
  text.position.z = 0.002;
  g.add(text);
  g.userData['size'] = [width, height];
  return g;
}

/** What the default composer reads and calls. The world owns one; an override uses `props.send`. */
export interface ComposerState {
  readonly draft: string;
  readonly submit: () => void;
  readonly requestInput: () => void;
}

export const COMPOSER_LABELS = { placeholder: 'Reply…', send: 'Send' } as const;
const FIELD_H = 0.07;
const SEND_W = 0.12;

export function defaultComposer(
  props: ComposerRenderProps,
  state: ComposerState,
  width: number,
): Object3D {
  const { theme } = props;
  const g = new Group();
  g.name = WORLD_CONTRACT.objects.composer;
  const fieldW = width - SEND_W - 0.01;

  const field = new Group();
  field.position.x = -(width - fieldW) / 2;
  const fb = panelBacking(theme, fieldW, FIELD_H);
  if (fb !== null) {
    field.add(fb);
  } else {
    field.add(
      new Mesh(new PlaneGeometry(fieldW, FIELD_H), new MeshBasicMaterial({ visible: false })),
    );
  }
  const shown = state.draft === '' ? COMPOSER_LABELS.placeholder : state.draft;
  const label = createTextMesh(shown, theme, {
    maxWidthMetres: fieldW - 0.02,
    size: 0.8,
  });
  label.position.z = 0.002;
  field.add(label);
  interactive(field, 'field', state.requestInput);
  g.add(field);

  const send = new Group();
  send.position.x = (width - SEND_W) / 2;
  const sb = panelBacking(
    { ...theme, panelColor: theme.accentColor, panelMaterial: 'solid' },
    SEND_W,
    FIELD_H,
  );
  if (sb !== null) {
    send.add(sb);
  }
  const sl = createTextMesh(COMPOSER_LABELS.send, theme, {
    maxWidthMetres: SEND_W,
    size: 0.8,
    color: theme.accentTextColor,
  });
  sl.position.z = 0.002;
  send.add(sl);
  if (!props.disabled) {
    interactive(send, 'send', state.submit);
  }
  g.add(send);
  g.userData['size'] = [width, FIELD_H];
  return g;
}
