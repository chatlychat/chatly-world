/**
 * Picks: a `card_grid` rendered as objects in the scene.
 *
 * `buildGrid` lays the cards out (`layout.ts`), asks the card renderer — the
 * default below or a host's override — for each one and parents them. The
 * default card is a plate with title, subtitle and price label, a glTF model
 * if the card has one, and the theme's pedestal, beam and selection ring.
 */
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  DoubleSide,
  type Object3D,
} from 'three';

import { layoutCards, type GridPlacement, type Mount } from './layout.js';
import { fitModel, type ModelAnchor, type ModelLoader } from './model.js';
import { createTextMesh } from './text.js';
import { accentMaterial, panelBacking } from './theme-apply.js';
import { WORLD_CONTRACT } from './types.js';

import type {
  BlockOf,
  CardRenderProps,
  ConversationMessage,
  ResolvedWorldTheme,
} from '@chatlychat/core';

const PLATE_W = 0.28;
const PLATE_H = 0.2;

export interface CardData {
  readonly title: string;
  readonly subtitle: string | null;
  readonly price: { readonly amount: number; readonly currency: string } | null;
  readonly model: {
    readonly url: string;
    readonly format?: string;
    readonly scale?: number;
    readonly anchor?: ModelAnchor;
  } | null;
}

/** Read the fields a world draws off a card block, tolerantly: the block is wire data. */
export function readCard(block: Readonly<Record<string, unknown>>): CardData {
  const s = (k: string): string | null =>
    typeof block[k] === 'string' && block[k] !== '' ? block[k] : null;
  const p = block['price'] as { amount?: unknown; currency?: unknown } | undefined;
  const m = block['model'] as Record<string, unknown> | undefined;
  return {
    title: s('title') ?? '',
    subtitle: s('subtitle'),
    price:
      typeof p?.amount === 'number' && typeof p.currency === 'string'
        ? { amount: p.amount, currency: p.currency }
        : null,
    model:
      typeof m?.['url'] === 'string'
        ? {
            url: m['url'],
            ...(typeof m['format'] === 'string' ? { format: m['format'] } : {}),
            ...(typeof m['scale'] === 'number' ? { scale: m['scale'] } : {}),
            ...(typeof m['anchor'] === 'string' ? { anchor: m['anchor'] as ModelAnchor } : {}),
          }
        : null,
  };
}

/** Minor units to a locale string. The fraction digits come from the currency, not from "100". */
export function formatPrice(amount: number, currency: string, locale?: string): string {
  try {
    const f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    return f.format(amount / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    return `${String(amount / 100)} ${currency}`;
  }
}

export interface CardDeps {
  readonly loadModel: ModelLoader;
  readonly onError: (e: unknown) => void;
}

export const cardKey = (
  message: ConversationMessage,
  block: Readonly<Record<string, unknown>>,
  index: number,
): string => `${message.id}:${typeof block['id'] === 'string' ? block['id'] : String(index)}`;

/** The default `renderCard`. */
export function defaultCard(props: CardRenderProps, deps: CardDeps): Object3D {
  const { theme } = props;
  const card = readCard(props.block);
  const g = new Group();
  g.name = WORLD_CONTRACT.objects.card;
  g.userData['float'] = theme.cardPedestal === 'float';

  if (theme.cardPedestal === 'plinth') {
    const plinth = new Mesh(new CylinderGeometry(0.16, 0.18, 0.1, 24), accentMaterial(theme));
    plinth.name = 'cl3-card-pedestal';
    plinth.position.y = -0.1;
    g.add(plinth);
  } else if (theme.cardPedestal === 'hanger') {
    const rod = new Mesh(new CylinderGeometry(0.004, 0.004, 0.5, 6), accentMaterial(theme));
    rod.name = 'cl3-card-pedestal';
    rod.position.y = 0.35;
    g.add(rod);
  }
  if (theme.cardBeam) {
    const beam = new Mesh(
      new CylinderGeometry(0.12, 0.16, 1.2, 24, 1, true),
      accentMaterial(theme, 0.2),
    );
    beam.name = 'cl3-card-beam';
    beam.position.y = 0.55;
    g.add(beam);
  }

  const plate = panelBacking(theme, PLATE_W, PLATE_H);
  const body = new Group();
  if (plate !== null) {
    body.add(plate);
  }
  const title = createTextMesh(card.title, theme, { maxWidthMetres: PLATE_W - 0.02, size: 0.8 });
  title.position.set(0, card.subtitle === null ? 0.02 : 0.04, 0.002);
  body.add(title);
  if (card.subtitle !== null) {
    const sub = createTextMesh(card.subtitle, theme, { maxWidthMetres: PLATE_W - 0.02, size: 0.6 });
    sub.position.set(0, -0.03, 0.002);
    body.add(sub);
  }
  if (theme.cardPriceLabel && card.price !== null) {
    const price = createTextMesh(formatPrice(card.price.amount, card.price.currency), theme, {
      maxWidthMetres: PLATE_W,
      size: 0.8,
      color: theme.accentColor,
    });
    price.name = 'cl3-card-price';
    price.position.set(0, -PLATE_H / 2 - 0.03, 0.002);
    body.add(price);
  }
  g.add(body);

  if (card.model !== null && card.model.format !== 'usdz') {
    const { url, scale, anchor } = card.model;
    deps.loadModel(url).then((m) => {
      const fitted = fitModel(m.scene, scale ?? 1, anchor ?? 'center');
      fitted.name = 'cl3-card-model';
      // The model stands above its label plate.
      body.position.y = -0.2;
      fitted.position.y = 0.1;
      g.add(fitted);
    }, deps.onError);
  }

  const ring = new Mesh(
    new RingGeometry(0.2, 0.23, 32),
    new MeshBasicMaterial({ color: theme.cardHighlightColor, side: DoubleSide }),
  );
  ring.name = 'cl3-card-highlight';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.14;
  ring.visible = props.selected;
  g.add(ring);
  return g;
}

/** Whether a card node is drawn selected — the default's ring, readable by tests and hosts. */
export function isHighlighted(node: Object3D): boolean {
  return node.getObjectByName('cl3-card-highlight')?.visible === true;
}

export interface GridBuild {
  readonly group: Group;
  readonly mount: Mount;
  /** card key -> node, so one card can be redrawn when its selection changes. */
  readonly nodes: Map<string, { node: Object3D; index: number }>;
}

export function buildGrid(
  placement: GridPlacement,
  count: number,
  theme: ResolvedWorldTheme,
  draw: (index: number) => Object3D,
  keyOf: (index: number) => string,
): GridBuild {
  const group = new Group();
  group.name = WORLD_CONTRACT.objects.grid;
  group.userData['placement'] = placement;
  const { poses, mount } = layoutCards(placement, count, theme.cardSpacingMetres);
  const nodes = new Map<string, { node: Object3D; index: number }>();
  poses.forEach((p, i) => {
    const node = draw(i);
    node.position.set(...p.position);
    node.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    group.add(node);
    nodes.set(keyOf(i), { node, index: i });
  });
  return { group, mount, nodes };
}

export type { BlockOf };
