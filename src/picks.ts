/**
 * The picks: a grid of cards drawn from the latest card message, one of which
 * can be selected and held. Selection is told to the thread before the world
 * claims it; a refusal puts the card back.
 *
 * `theme` and `reduced` are read per call because both change under a live
 * world (`setTheme`, `setReducedMotion`).
 */
import {
  type BlockOf,
  type CardRenderProps,
  type ConversationMessage,
  type ResolvedWorldTheme,
  type ResolvedWorldPlacement,
} from '@chatlychat/core';
import { Vector3, type Object3D } from 'three';

import { buildGrid, cardKey, defaultCard, readCard, type GridBuild } from './cards.js';
import { cardActions, makeHandlers, type HandlerHooks } from './handlers.js';
import { interactive } from './input.js';
import { GRID_PLACEMENTS, type GridPlacement } from './layout.js';
import { type Motion, enter, setOpacity } from './motion.js';
import { WORLD_CONTRACT, type SoundKind, type WorldOptions } from './types.js';

import type { cachedLoader } from './model.js';
import type { Selection } from './selection.js';

export type PickGrid = GridBuild & {
  message: ConversationMessage;
  cards: readonly Record<string, unknown>[];
};

export const named = (node: Object3D, name: string): Object3D => {
  node.name = node.name === '' ? name : node.name;
  return node;
};

export interface PicksDeps {
  conversation: WorldOptions['conversation'];
  camera: WorldOptions['camera'];
  renderers: WorldOptions['renderers'];
  anchors: NonNullable<WorldOptions['anchors']>;
  theme: () => ResolvedWorldTheme;
  reduced: () => boolean;
  placement: ResolvedWorldPlacement;
  root: Object3D;
  motion: Motion;
  selection: Selection;
  hooks: HandlerHooks;
  loadModel: ReturnType<typeof cachedLoader>;
  onError: (err: unknown) => void;
  sound: (kind: SoundKind, at?: Object3D) => void;
}

export interface Picks {
  grid: () => PickGrid | null;
  select: (key: string) => Promise<void>;
  release: () => void;
  showGrid: (message: ConversationMessage) => void;
}

export function createPicks(deps: PicksDeps): Picks {
  const {
    conversation,
    camera,
    renderers: r,
    anchors,
    theme,
    reduced,
    placement,
    root,
    motion,
    selection,
    hooks,
    loadModel,
    onError,
    sound,
  } = deps;

  let grid: PickGrid | null = null;
  let held: Object3D | null = null;

  const drawCard = (g: PickGrid, index: number): Object3D => {
    const block = g.cards[index] as Record<string, unknown>;
    const key = cardKey(g.message, block, index);
    const data = readCard(block);
    const props: CardRenderProps = {
      theme: theme(),
      placement,
      reducedMotion: reduced(),
      block: { type: 'card', ...block } as BlockOf<'card'>,
      message: g.message,
      selected: selection.id === key,
      ...makeHandlers(conversation, g.message, data.title, cardActions(block), hooks),
    };
    const node = named(
      r?.renderCard !== undefined
        ? r.renderCard(props)
        : defaultCard(props, { loadModel, onError }),
      WORLD_CONTRACT.objects.card,
    );
    node.userData['cardKey'] = key;
    if (node.userData['cl3Handled'] !== true) {
      interactive(node, 'card', () => void toggle(key));
    }
    return node;
  };

  const redraw = (key: string | null): void => {
    const e = key === null ? undefined : grid?.nodes.get(key);
    if (grid === null || e === undefined) {
      return;
    }
    const next = drawCard(grid, e.index);
    next.position.copy(e.node.position);
    next.rotation.copy(e.node.rotation);
    const parent = e.node.parent;
    if (parent !== null) {
      // Same slot in the child list, so traversal order stays the card order.
      parent.children.splice(parent.children.indexOf(e.node), 1, next);
      next.parent = parent;
      e.node.parent = null;
    }
    grid.nodes.set(key as string, { node: next, index: e.index });
  };

  const dropHeld = (): void => {
    held?.removeFromParent();
    held = null;
  };

  const showHeld = (key: string): void => {
    dropHeld();
    if (grid === null) {
      return;
    }
    const index = grid.nodes.get(key)?.index ?? 0;
    const block = grid.cards[index] as Record<string, unknown>;
    const data = readCard(block);
    const props = {
      theme: theme(),
      placement,
      reducedMotion: reduced(),
      block: { type: 'card', ...block } as BlockOf<'card'>,
      message: grid.message,
      release: () => release(),
      ...makeHandlers(conversation, grid.message, data.title, cardActions(block), hooks),
    };
    const node =
      r?.renderPick !== undefined
        ? r.renderPick(props)
        : (() => {
            const n = defaultCard({ ...props, selected: true }, { loadModel, onError });
            n.name = WORLD_CONTRACT.objects.pick;
            n.scale.setScalar(0.6);
            return n;
          })();
    named(node, WORLD_CONTRACT.objects.pick);
    if (node.userData['cl3Handled'] !== true) {
      interactive(node, 'release', release);
    }
    if (anchors.hand !== undefined && anchors.hand !== null) {
      anchors.hand.add(node);
    } else {
      // Placed once, in front of where the visitor is looking — not carried on the head.
      const dir = camera.getWorldDirection(new Vector3());
      const at = camera.getWorldPosition(new Vector3()).addScaledVector(dir, 0.6);
      at.y -= 0.25;
      root.add(node);
      node.position.copy(root.worldToLocal(at));
    }
    const y = node.position.y;
    const k = theme().motionPick;
    motion.run(k === 'none' ? 0 : 250, (t) => {
      if (k === 'rise') {
        node.position.y = y - 0.15 * (1 - t);
      } else if (k === 'drop') {
        node.position.y = y + 0.15 * (1 - t);
      } else {
        setOpacity(node, t);
      }
    });
    held = node;
  };

  const select = async (key: string): Promise<void> => {
    const e = grid?.nodes.get(key);
    if (grid === null || e === undefined || selection.id === key) {
      return;
    }
    const prev = selection.id;
    const block = grid.cards[e.index] as Record<string, unknown>;
    selection.set(key);
    redraw(prev);
    redraw(key);
    showHeld(key);
    sound('pick', e.node);
    try {
      await makeHandlers(conversation, grid.message, readCard(block).title, [], hooks).select({
        type: 'card.select',
        card: typeof block['id'] === 'string' ? block['id'] : `c${String(e.index)}`,
        message: grid.message.id,
      });
      sound('select', e.node);
    } catch (err) {
      // The thread never heard about it, so the world must not claim it was picked.
      if (selection.id === key) {
        release();
      }
      onError(err);
    }
  };

  function release(): void {
    const prev = selection.id;
    selection.set(null);
    redraw(prev);
    dropHeld();
  }

  const toggle = (key: string): Promise<void> => {
    if (selection.id === key) {
      release();
      return Promise.resolve();
    }
    return select(key);
  };

  const showGrid = (message: ConversationMessage): void => {
    const blocks = message.blocks?.blocks ?? [];
    const block = [...blocks].reverse().find((b) => b.type === 'card_grid' || b.type === 'card');
    grid?.group.removeFromParent();
    release();
    grid = null;
    if (block === undefined) {
      return;
    }
    const cards =
      block.type === 'card'
        ? [block]
        : ((block['cards'] as Record<string, unknown>[] | undefined) ?? []);
    const want = block['placement'];
    const kind: GridPlacement = GRID_PLACEMENTS.includes(want as GridPlacement)
      ? (want as GridPlacement)
      : 'arc';
    const draft = { message, cards } as unknown as PickGrid;
    const built = buildGrid(
      kind,
      cards.length,
      theme(),
      (i) => drawCard(draft, i),
      (i) => cardKey(message, cards[i] as Record<string, unknown>, i),
    );
    grid = Object.assign(built, { message, cards });
    // Spawned where the viewer stands and faces now; then left alone.
    const cam = camera.getWorldPosition(new Vector3());
    const dir = camera.getWorldDirection(new Vector3());
    built.group.position.copy(root.worldToLocal(cam));
    built.group.rotation.y = Math.atan2(-dir.x, -dir.z);
    root.add(built.group);
    for (const { node } of built.nodes.values()) {
      enter(motion, node, theme().motionEntrance);
    }
  };

  return { grid: () => grid, select, release, showGrid };
}
