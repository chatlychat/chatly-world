/**
 * The embodied agent's body: a model, four state clips, one-shot expressions,
 * a gaze and a mouth.
 *
 * What it does NOT do is walk. `presence.idle` (`stand`/`wander`/`follow`) and
 * `personalSpaceMetres` are facts about where the agent may go, and wayfinding
 * is the host's — they are readable on `presence` and honoured by nobody here.
 *
 * Reduced motion always wins: state clips are held on their first frame (a
 * pose, not a loop), expression one-shots are not played, gaze snaps rather
 * than turns, and there is no crossfade. The mouth still follows visemes —
 * speech is not decorative motion, and a mouth that never moves on a speaking
 * agent would read as a broken one.
 */
import {
  AnimationClip,
  AnimationMixer,
  CapsuleGeometry,
  Group,
  LoopOnce,
  Mesh,
  SphereGeometry,
  Vector3,
  type AnimationAction,
  type Camera,
  type Object3D,
} from 'three';

import { fitModel, type ModelLoader } from './model.js';
import { wrapAngle } from './panel.js';
import { createTextMesh } from './text.js';
import { accentMaterial } from './theme-apply.js';
import { WORLD_CONTRACT, WorldError } from './types.js';
import { morphNamesFor, visemeAt, type VisemeTrack } from './visemes.js';
import { gazePoint, VrmRig, type VrmLike } from './vrm.js';

import type { AgentExpression, AgentPresenceState, AgentWorldPresence } from '@chatlychat/core';
import type { ResolvedWorldTheme } from '@chatlychat/core';

const TURN_RATE = 6;
const FADE_S = 0.25;

export type GazeTarget = Object3D | Vector3 | 'visitor' | null;

interface MorphMesh extends Object3D {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
}

export class AgentBody {
  public readonly root = new Group();
  public presence: AgentWorldPresence | null = null;
  public reduced: boolean;
  private model: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private clips: readonly AnimationClip[] = [];
  private current: AnimationAction | null = null;
  private avatarUrl: string | null = null;
  private tag: Object3D | null = null;
  private gaze: GazeTarget = null;
  private track: VisemeTrack | null = null;
  private trackStart = 0;
  private morphs: MorphMesh[] = [];
  private rig: VrmRig | null = null;
  private lastState: AgentPresenceState | null = null;
  private refused: string | null = null;

  public constructor(
    private theme: ResolvedWorldTheme,
    private readonly loadModel: ModelLoader,
    private readonly onError: (e: unknown) => void,
    reduced: boolean,
  ) {
    this.reduced = reduced;
    this.root.name = WORLD_CONTRACT.objects.agent;
    this.root.add(this.placeholder());
  }

  public get hasModel(): boolean {
    return this.model !== null;
  }

  public get activeClip(): string | null {
    return this.current?.getClip().name ?? null;
  }

  public setTheme(theme: ResolvedWorldTheme): void {
    this.theme = theme;
  }

  private placeholder(): Object3D {
    const g = new Group();
    g.name = 'cl3-agent-placeholder';
    const body = new Mesh(new CapsuleGeometry(0.2, 0.7, 4, 12), accentMaterial(this.theme));
    body.position.y = 0.55;
    const head = new Mesh(new SphereGeometry(0.17, 16, 12), accentMaterial(this.theme));
    head.position.y = 1.3;
    g.add(body, head);
    return g;
  }

  public setPresence(presence: AgentWorldPresence | null): void {
    this.presence = presence;
    this.setTag(presence === null ? null : (presence.nameTag ?? presence.name));
    const a = presence?.avatar;
    if (a?.format === 'usdz' && this.refused !== a.url) {
      this.refused = a.url;
      this.onError(
        new WorldError(
          'unsupported_format',
          'usdz avatars are not loadable by three.js; showing the placeholder',
        ),
      );
    }
    const url = a !== undefined && a.format !== 'usdz' ? a.url : null;
    if (url === this.avatarUrl) {
      return;
    }
    this.avatarUrl = url;
    if (url === null || a === undefined) {
      this.swapModel(null, []);
      return;
    }
    this.loadModel(url, a.format === undefined ? undefined : { format: a.format }).then((m) => {
      if (this.avatarUrl === url) {
        this.swapModel(
          fitModel(m.scene, a.scale ?? 1, a.anchor ?? 'base'),
          m.animations,
          m.vrm ?? null,
        );
      }
    }, this.onError);
  }

  private setTag(text: string | null): void {
    if (this.tag !== null) {
      this.root.remove(this.tag);
      this.tag = null;
    }
    if (text !== null) {
      this.tag = createTextMesh(text, this.theme, { maxWidthMetres: 0.8, size: 0.8 });
      this.tag.name = 'cl3-agent-nametag';
      this.tag.position.y = 1.75;
      this.root.add(this.tag);
    }
  }

  private swapModel(
    model: Object3D | null,
    clips: readonly AnimationClip[],
    vrm: VrmLike | null = null,
  ): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.current = null;
    for (const c of [...this.root.children]) {
      if (c !== this.tag) {
        this.root.remove(c);
      }
    }
    this.model = model;
    this.clips = clips;
    this.morphs = [];
    this.rig = vrm === null || model === null ? null : new VrmRig(vrm, this.reduced);
    if (model === null) {
      this.root.add(this.placeholder());
      return;
    }
    this.root.add(model);
    model.traverse((o) => {
      if ((o as MorphMesh).morphTargetDictionary !== undefined) {
        this.morphs.push(o as MorphMesh);
      }
    });
    this.mixer = new AnimationMixer(model);
    // The state was set before the model arrived; its clip could not play then.
    if (this.lastState !== null) {
      this.setState(this.lastState);
    }
  }

  private action(name: string | null | undefined): AnimationAction | null {
    if (this.mixer === null || name === null || name === undefined) {
      return null;
    }
    const clip = AnimationClip.findByName([...this.clips], name);
    return clip === null ? null : this.mixer.clipAction(clip);
  }

  /** Move to the state's clip — the host's own name for it, from `presence.clips`. */
  public setState(state: AgentPresenceState): void {
    this.lastState = state;
    const next = this.action(this.presence?.clips?.[state]);
    if (next === null || next === this.current) {
      return;
    }
    next.reset();
    next.play();
    if (this.reduced) {
      next.paused = true; // a held pose, not a loop
      this.current?.stop();
    } else if (this.current !== null) {
      next.crossFadeFrom(this.current, FADE_S, false);
    }
    this.current = next;
  }

  /** Play a one-shot expression clip. Skipped entirely under reduced motion. */
  public playExpression(clipName: string | null): boolean {
    const a = this.reduced ? null : this.action(clipName);
    if (a === null) {
      return false;
    }
    a.reset();
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    return true;
  }

  /** A face for a cue, on a VRM avatar. False for a gesture or a glTF avatar: the host's clip is all there is. */
  public express(e: AgentExpression | null): boolean {
    return this.rig?.express(e) ?? false;
  }

  public get isVrm(): boolean {
    return this.rig !== null;
  }

  public lookAt(target: GazeTarget): void {
    this.gaze = target;
  }

  public setVisemes(track: VisemeTrack | null, nowMs: number): void {
    this.track = track;
    this.trackStart = nowMs;
    if (track === null) {
      this.applyViseme(null, 0);
    }
  }

  private applyViseme(v: string | null, w: number): void {
    if (this.rig !== null) {
      this.rig.setMouth(v, w);
      return;
    }
    for (const m of this.morphs) {
      const dict = m.morphTargetDictionary;
      const inf = m.morphTargetInfluences;
      if (dict === undefined || inf === undefined) {
        continue;
      }
      // Zero every viseme-ish target first so a released mouth closes.
      for (const [name, idx] of Object.entries(dict)) {
        if (/^(viseme_|Viseme_)/.test(name) || ['aa', 'ih', 'ou', 'ee', 'oh'].includes(name)) {
          inf[idx] = 0;
        }
      }
      if (v !== null) {
        const hit = morphNamesFor(v).find((n) => dict[n] !== undefined);
        if (hit !== undefined) {
          inf[dict[hit] as number] = w;
        }
      }
    }
  }

  public update(dtMs: number, nowMs: number, camera: Camera): void {
    this.mixer?.update(dtMs / 1000);
    if (this.track !== null) {
      const e = visemeAt(this.track, nowMs - this.trackStart);
      this.applyViseme(e?.v ?? null, e?.w ?? 0);
    }
    if (this.gaze !== null) {
      const here = this.root.getWorldPosition(new Vector3());
      const at =
        this.gaze === 'visitor'
          ? camera.getWorldPosition(new Vector3())
          : this.gaze instanceof Vector3
            ? this.gaze
            : this.gaze.getWorldPosition(new Vector3());
      const want = Math.atan2(at.x - here.x, at.z - here.z);
      const err = wrapAngle(want - this.root.rotation.y);
      const step = TURN_RATE * (dtMs / 1000);
      this.root.rotation.y =
        this.reduced || Math.abs(err) <= step ? want : this.root.rotation.y + Math.sign(err) * step;
    }
    if (this.rig !== null) {
      this.rig.reduced = this.reduced;
      this.rig.gazeAt(this.root, gazePoint(this.gaze, camera), dtMs / 1000);
      this.rig.update(dtMs / 1000);
    }
    if (this.tag !== null) {
      // The tag turns to the viewer regardless of where the body faces.
      const cam = camera.getWorldPosition(new Vector3());
      const t = this.tag.getWorldPosition(new Vector3());
      this.tag.rotation.y = Math.atan2(cam.x - t.x, cam.z - t.z) - this.root.rotation.y;
    }
  }

  public dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}
