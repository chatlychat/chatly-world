import type { AgentBody } from './agent.js';
import type { CapabilityRegistry } from './capabilities.js';
import type { Composer } from './composer.js';
import type { Gaze, Hit } from './input.js';
import type { Selection } from './selection.js';
import type { ResolvedWorldPlacement, ResolvedWorldTheme, WorldTheme } from '@chatlychat/core';
import type { Group, Object3D, Vector3 } from 'three';

/** What `createWorld` returns. */
export interface ChatlyWorld {
  /** Add this to your scene. */
  readonly root: Group;
  readonly capabilities: CapabilityRegistry;
  readonly selection: Selection;
  readonly agent: AgentBody;
  readonly composer: Composer;
  readonly theme: ResolvedWorldTheme;
  readonly placement: ResolvedWorldPlacement;
  readonly reducedMotion: boolean;
  /** Call every frame with the frame time in SECONDS. */
  update(dtSeconds: number): void;
  /** What a ray from `origin` along `direction` strikes, or null. Does not activate it. */
  pick(origin: Vector3, direction: Vector3): Hit | null;
  /** Normalised device coordinates (-1..1), for a mouse or touch. */
  pickAtPointer(x: number, y: number): Hit | null;
  activate(hit: Hit): void;
  attachController(controller: Object3D): () => void;
  attachGaze(opts?: { dwellMs?: number }): Gaze;
  setReducedMotion(reduced: boolean): void;
  setTheme(theme: WorldTheme | null, layers?: readonly WorldTheme[]): void;
  setScene(scene: 'light' | 'dark'): void;
  /** Select a card by key (`cardKeys()`); the same as the visitor tapping it. */
  select(key: string): Promise<void>;
  release(): void;
  cardKeys(): readonly string[];
  dispose(): void;
}
