/**
 * The public contract: options, anchors, errors, and the renderer contract's
 * names and version.
 */
import type { ModelLoader } from './model.js';
import type { VrmModuleLoader } from './vrm.js';
import type {
  AgentWorldPresence,
  Conversation,
  PresenceMap,
  WorldHostAbilities,
  WorldPlacementRequest,
  WorldRenderers,
  WorldTheme,
} from '@chatlychat/core';
import type { Camera, Object3D, Vector3 } from 'three';

/**
 * The renderer contract, versioned like the widget's `cl-` class contract.
 *
 * `objects` are the `Object3D.name` every default renderer gives its output,
 * and the world gives the same name to an override's output when the override
 * left it blank, so `scene.getObjectByName('cl3-card')` finds the card
 * whoever drew it. A name is part of the contract: renaming one is a major
 * version, adding one is a minor. A host that pins `contract: 1` on its
 * renderers is refused, loudly, by a world that no longer speaks it.
 */
export const WORLD_CONTRACT = {
  version: 1,
  renderers: [
    'renderCard',
    'renderPick',
    'renderBubble',
    'renderPanel',
    'renderComposer',
    'renderAgent',
  ],
  objects: {
    root: 'cl3-world',
    grid: 'cl3-grid',
    card: 'cl3-card',
    pick: 'cl3-pick',
    bubble: 'cl3-bubble',
    typing: 'cl3-typing',
    panel: 'cl3-panel',
    composer: 'cl3-composer',
    agent: 'cl3-agent',
  },
} as const;

export type WorldObjectName = (typeof WORLD_CONTRACT.objects)[keyof typeof WORLD_CONTRACT.objects];

export type WorldNodeRenderers = WorldRenderers<Object3D> & {
  /** Pin the contract version these renderers were written against. */
  readonly contract?: number;
};

export type WorldErrorCode =
  | 'unsupported_contract'
  | 'disposed'
  | 'unknown_action'
  | 'unsupported_format'
  | 'missing_peer';

export class WorldError extends Error {
  public readonly code: WorldErrorCode;

  public constructor(code: WorldErrorCode, message: string) {
    super(message);
    this.name = 'WorldError';
    this.code = code;
  }
}

/** The slice of a `Conversation` the world uses, so a test or a proxy can stand in. */
export type ConversationLike = Pick<
  Conversation,
  | 'conversationId'
  | 'getSnapshot'
  | 'subscribe'
  | 'onCapability'
  | 'postback'
  | 'react'
  | 'send'
  | 'setTyping'
  | 'requestStep'
  // A `cards` press reaches the operator's backend through the same target
  // `requestStep` does; `dispatchPress` requires both.
  | 'requestCards'
  | 'reportAction'
>;

/**
 * Where things are in the HOST's scene. Every member optional: an absent one
 * means the world falls back to something sensible (a bubble with no speaker
 * anchor hangs over the agent; a pick with no hand floats where it was taken).
 */
export interface WorldAnchors {
  /** The object a message's author stands for. `null` = the agent's body. */
  readonly speaker?: (actorId: string | null) => Object3D | null;
  /** The visitor's own avatar, for their bubbles. Without it they get none. */
  readonly visitor?: Object3D | null;
  /** A named place a `lookAt` or `scene.highlight` points at. */
  readonly resolve?: (ref: string) => Object3D | Vector3 | null;
  /** A controller grip or hand: the panel in `wrist` mode and a held pick attach here. */
  readonly wrist?: Object3D | null;
  readonly hand?: Object3D | null;
}

export type PanelFollow = 'fixed' | 'lazy' | 'wrist';

export type SoundKind = 'send' | 'receive' | 'pick' | 'select';

export interface SoundCue {
  readonly kind: SoundKind;
  readonly url: string;
  readonly volume: number;
  /** Play it from `position` (world space) rather than flat. */
  readonly spatial: boolean;
  readonly position: Vector3 | null;
}

export interface WorldOptions {
  readonly conversation: ConversationLike;
  /** The camera the visitor sees through (the XR camera in a headset). */
  readonly camera: Camera;
  /** The channel's `worldTheme` (`core.worldTheme`). */
  readonly theme?: WorldTheme | null;
  readonly themeLayers?: readonly WorldTheme[];
  /** What the scene's light is; consulted when the theme's scheme is `auto`. */
  readonly scene?: 'light' | 'dark';
  /** The viewer's setting. A function is re-read every `update`. */
  readonly reducedMotion?: boolean | (() => boolean);
  readonly presences?: PresenceMap;
  readonly placement?: WorldPlacementRequest;
  readonly abilities?: WorldHostAbilities;
  readonly follow?: PanelFollow;
  readonly anchors?: WorldAnchors;
  readonly renderers?: WorldNodeRenderers;
  readonly loadModel?: ModelLoader;
  /**
   * Only for VRM avatars, and only if you bundle: `() => import('@pixiv/three-vrm')`.
   * `@pixiv/three-vrm` is an optional peer dependency; a glTF-only host never needs it.
   */
  readonly loadVrm?: VrmModuleLoader;
  readonly onSound?: (cue: SoundCue) => void;
  /** Polite live-region text: the agent's state, new messages, an action's equivalent. */
  readonly announce?: (text: string) => void;
  /** The visitor pressed the composer's field: open your keyboard, mic or DOM input. */
  readonly onComposeRequest?: () => void;
  /** A `host_event` card action no registered capability claimed. */
  readonly onHostEvent?: (event: string, data: Readonly<Record<string, unknown>>) => void;
  /** A `url` card action. The world never navigates. */
  readonly onOpenUrl?: (href: string) => void;
  /** A `navigate` card action. Receives the action whole; the world never routes. */
  readonly onNavigate?: (action: Readonly<Record<string, unknown>>) => Promise<void> | void;
  readonly onError?: (error: unknown) => void;
  readonly now?: () => number;
}

export type { AgentWorldPresence };
