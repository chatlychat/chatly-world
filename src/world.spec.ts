import { Group, Mesh, MeshBasicMaterial, BoxGeometry, type Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { isHighlighted } from './cards.js';
import { layoutCards } from './layout.js';
import { fakeConversation, flush, grid, msg, viewerCamera, withBlocks } from './test/fake.js';
import { aimAt, byName, eq, setup } from './test/world-fixtures.js';
import { WORLD_CONTRACT, WorldError, type WorldOptions } from './types.js';
import { createWorld } from './world.js';

describe('picks', () => {
  it('lays a card_grid out by its placement, from the history already in the thread', () => {
    const { world } = setup();
    const g = world.root.getObjectByName(WORLD_CONTRACT.objects.grid);
    expect(g?.userData['placement']).toBe('shelf');
    expect(world.cardKeys()).toEqual(['m1:k0', 'm1:k1', 'm1:k2']);
    const want = layoutCards('shelf', 3, world.theme.cardSpacingMetres).poses;
    const cards = byName(world, 'cl3-card');
    expect(cards).toHaveLength(3);
    cards.forEach((c, i) => {
      expect(c.position.x).toBeCloseTo(want[i]?.position[0] ?? NaN, 6);
      expect(c.position.z).toBeCloseTo(want[i]?.position[2] ?? NaN, 6);
    });
    // Spawned where the viewer stands (eye height 1.6), then left alone.
    expect(g?.position.y).toBeCloseTo(1.6, 6);
  });

  it('an unknown placement falls back to an arc, and a newer grid replaces the old', () => {
    const { world, f } = setup({}, 'carousel');
    expect(world.root.getObjectByName('cl3-grid')?.userData['placement']).toBe('arc');
    f.push(withBlocks('m2', [grid('wall', ['Only'])], { authorType: 'bot' }));
    expect(byName(world, 'cl3-grid')).toHaveLength(1);
    expect(world.cardKeys()).toEqual(['m2:k0']);
  });

  it('a card with a model loads it through the host loader, fitted by anchor and scale', async () => {
    const loadModel = vi.fn(() =>
      Promise.resolve({
        scene: new Mesh(new BoxGeometry(2, 4, 2), new MeshBasicMaterial()),
        animations: [],
      }),
    );
    const f = fakeConversation({
      messages: [
        withBlocks('m1', [
          {
            type: 'card_grid',
            placement: 'arc',
            cards: [
              {
                id: 'k0',
                title: 'Dunk',
                model: {
                  url: 'https://cdn.test/dunk.glb',
                  format: 'gltf',
                  scale: 0.5,
                  anchor: 'base',
                },
              },
            ],
          },
        ]),
      ],
    });
    const world = createWorld({ conversation: f.conv, camera: viewerCamera(), loadModel });
    await flush();
    expect(loadModel).toHaveBeenCalledWith('https://cdn.test/dunk.glb');
    expect(world.root.getObjectByName('cl3-card-model')).toBeDefined();
  });

  it('draws the pedestal, beam and price label the theme asks for — and not otherwise', () => {
    const quiet = setup();
    expect(quiet.world.root.getObjectByName('cl3-card-pedestal')).toBeUndefined();
    expect(quiet.world.root.getObjectByName('cl3-card-beam')).toBeUndefined();
    expect(quiet.world.root.getObjectByName('cl3-card-price')?.userData['text']).toBe('£109.00');

    const loud = setup({
      theme: { cardPedestal: 'plinth', cardBeam: true, cardPriceLabel: false },
    });
    expect(loud.world.root.getObjectByName('cl3-card-pedestal')).toBeDefined();
    expect(loud.world.root.getObjectByName('cl3-card-beam')).toBeDefined();
    expect(loud.world.root.getObjectByName('cl3-card-price')).toBeUndefined();
  });
});

describe('selection round-trip', () => {
  it('a tap on a pick selects it, tells the conversation, highlights it and puts it in hand', async () => {
    const { world, f, camera } = setup();
    const said: string[] = [];
    const [first] = byName(world, 'cl3-card');
    const hit = aimAt(world, camera, first as Object3D);
    expect(hit?.kind).toBe('card');
    world.activate(hit as NonNullable<typeof hit>);
    await flush();

    expect(world.selection.id).toBe('m1:k0');
    expect(f.calls.postbacks).toEqual([
      { body: 'Dunk', payload: { type: 'card.select', card: 'k0', message: 'm1' } },
    ]);
    const cards = byName(world, 'cl3-card');
    expect(isHighlighted(cards[0] as Object3D)).toBe(true);
    expect(isHighlighted(cards[1] as Object3D)).toBe(false);
    expect(byName(world, 'cl3-pick')).toHaveLength(1);
    expect(said).toEqual([]);
  });

  it('tapping the held pick, or the selected card again, puts it back', async () => {
    const { world, camera } = setup();
    await world.select('m1:k1');
    const held = byName(world, 'cl3-pick')[0] as Object3D;
    held.updateMatrixWorld(true);
    const hit = aimAt(world, camera, held);
    expect(hit?.kind).toBe('release');
    world.activate(hit as NonNullable<typeof hit>);
    expect(world.selection.id).toBeNull();
    expect(byName(world, 'cl3-pick')).toHaveLength(0);
    expect(isHighlighted(byName(world, 'cl3-card')[1] as Object3D)).toBe(false);
  });

  it('a host selecting from its own UI is the same event, and listeners hear it', async () => {
    const { world, f } = setup();
    const heard: (string | null)[] = [];
    world.selection.subscribe((id) => heard.push(id));
    await world.select('m1:k2');
    world.release();
    expect(heard).toEqual(['m1:k2', null]);
    expect(f.calls.postbacks[0]?.payload).toMatchObject({ card: 'k2' });
  });

  it('if the thread never heard about it, the world does not claim it was picked', async () => {
    const onError = vi.fn();
    const { world, f } = setup({ onError });
    f.state.failPostback = true;
    await world.select('m1:k0');
    expect(world.selection.id).toBeNull();
    expect(byName(world, 'cl3-pick')).toHaveLength(0);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('selecting a key that is not on screen does nothing', async () => {
    const { world, f } = setup();
    await world.select('nope');
    expect(world.selection.id).toBeNull();
    expect(f.calls.postbacks).toEqual([]);
  });

  it('plays the theme sound cues, spatialised', async () => {
    const onSound = vi.fn();
    const { world } = setup({
      onSound,
      theme: { soundPick: 'https://cdn.test/p.mp3', soundSelect: 'https://cdn.test/s.mp3' },
    });
    await world.select('m1:k0');
    expect(onSound.mock.calls.map((c) => [c[0].kind, c[0].url, c[0].spatial])).toEqual([
      ['pick', 'https://cdn.test/p.mp3', true],
      ['select', 'https://cdn.test/s.mp3', true],
    ]);
  });
});

describe('replaceable renderers', () => {
  it('renderCard is called once per card with the typed block, theme and the Chatly handlers', async () => {
    const seen: { title: unknown; selected: boolean; fns: string[] }[] = [];
    const renderCard = vi.fn(
      (p: Parameters<NonNullable<WorldOptions['renderers']>['renderCard'] & object>[0]) => {
        seen.push({
          title: p.block['title'],
          selected: p.selected,
          fns: [typeof p.select, typeof p.press, typeof p.react],
        });
        const g = new Group();
        g.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial()));
        return g;
      },
    );
    const { world, f, camera } = setup({ renderers: { contract: 1, renderCard } });
    expect(renderCard).toHaveBeenCalledTimes(3);
    expect(seen.map((s) => s.title)).toEqual(['Dunk', 'AF1', 'Jordan']);
    expect(seen.every((s) => !s.selected && s.fns.join() === 'function,function,function')).toBe(
      true,
    );

    // The world names the override's node, so selectors by name still find the card.
    const cards = byName(world, 'cl3-card');
    expect(cards).toHaveLength(3);
    // And the world's tap routing works on it with no wiring from the host.
    const hit = aimAt(world, camera, cards[1] as Object3D);
    world.activate(hit as NonNullable<typeof hit>);
    await flush();
    expect(f.calls.postbacks[0]?.payload).toMatchObject({ card: 'k1' });
    // Selecting redraws ONLY the two cards whose state changed.
    expect(renderCard.mock.calls.slice(3).map((c) => [c[0].block['title'], c[0].selected])).toEqual(
      [['AF1', true]],
    );
  });

  it('props.press and props.react are the core calls; a host_event reaches a registered capability', async () => {
    const f = fakeConversation({
      messages: [
        withBlocks('m1', [
          {
            type: 'card_grid',
            placement: 'arc',
            cards: [
              {
                id: 'k0',
                title: 'Dunk',
                actions: [
                  {
                    kind: 'postback',
                    label: 'Buy',
                    id: 'buy',
                    value: 'Buy it',
                    payload: { sku: 'x' },
                  },
                  {
                    kind: 'host_event',
                    label: 'Go',
                    id: 'go',
                    event: 'world.walk_to',
                    data: { place: 'shop' },
                  },
                  { kind: 'url', label: 'Open', href: 'https://x.test/' },
                  { kind: 'navigate', label: 'Shop', id: 'nav', path: '/shop' },
                ],
              },
            ],
          },
        ]),
      ],
    });
    const urls: string[] = [];
    const navs: unknown[] = [];
    let props:
      | Parameters<NonNullable<WorldOptions['renderers']>['renderCard'] & object>[0]
      | undefined;
    const world = createWorld({
      conversation: f.conv,
      camera: viewerCamera(),
      onOpenUrl: (h) => urls.push(h),
      onNavigate: (a) => void navs.push(a['path']),
      renderers: {
        renderCard: (p) => {
          props = p;
          return new Group();
        },
      },
    });
    const walked = vi.fn();
    world.capabilities.register('world.walk_to', walked, { equivalent: eq });
    await props?.press('buy');
    await props?.press('go');
    await props?.press('a2');
    await props?.press('nav');
    await props?.react('🔥');
    await expect(props?.press('missing')).rejects.toBeInstanceOf(WorldError);
    expect(f.calls.postbacks).toEqual([{ body: 'Buy it', payload: { sku: 'x' } }]);
    expect(walked).toHaveBeenCalledWith({ place: 'shop' }, { equivalent: eq, unprompted: false });
    expect(f.calls.reports[0]).toMatchObject({ messageId: 'm1', actionId: 'go', status: 'done' });
    expect(urls).toEqual(['https://x.test/']);
    expect(navs).toEqual(['/shop']);
    expect(f.calls.reactions).toEqual([['m1', '🔥']]);
  });

  it('renderBubble, renderPanel, renderComposer and renderAgent are each used in place of the default', async () => {
    const f = fakeConversation({ messages: [msg({ id: 'h', body: 'old' })] });
    const bubble = new Group();
    const calls = { bubble: 0, panel: 0, composer: 0, agent: [] as string[] };
    const world = createWorld({
      conversation: f.conv,
      camera: viewerCamera(),
      presences: { '*': { name: 'Mia' } },
      renderers: {
        renderBubble: () => (calls.bubble++, bubble),
        renderPanel: () => (calls.panel++, new Group()),
        renderComposer: () => (calls.composer++, new Group()),
        renderAgent: (p) => (
          calls.agent.push(`${p.agent.state}:${p.embodiment?.expression ?? '-'}`), new Group()
        ),
      },
    });
    expect(calls.panel).toBeGreaterThan(0);
    expect(calls.composer).toBeGreaterThan(0);
    expect(byName(world, 'cl3-agent')).toHaveLength(1);
    expect(world.agent.root.visible).toBe(false);
    f.push(msg({ id: 'n', body: 'hello', metadata: { embodiment: { expression: 'wave' } } }));
    expect(calls.bubble).toBe(1);
    expect(bubble.name).toBe('cl3-bubble');
    expect(calls.agent.at(-1)).toBe('listening:wave');
  });

  it('refuses renderers written for a contract this world does not speak', () => {
    const f = fakeConversation();
    expect(() =>
      createWorld({ conversation: f.conv, camera: viewerCamera(), renderers: { contract: 2 } }),
    ).toThrow(WorldError);
  });
});
