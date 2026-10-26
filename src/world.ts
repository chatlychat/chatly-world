/**
 * `createWorld` — a Chatly conversation rendered into the host's three.js
 * scene.
 *
 * The host adds `world.root` to ITS scene and calls `world.update(dt)` from
 * ITS loop; it keeps the scene, the avatars, the input and the wayfinding.
 * The world draws what the conversation contains (picks, bubbles, a panel, an
 * agent body), routes taps and bot-fired capabilities back, and applies the
 * `worldTheme` to all of it.
 */
import {
  embodiedAgent,
  expressionClip,
  messageEmbodiment,
  resolveWorldPlacement,
  resolveWorldTheme,
  type ConversationMessage,
  type ConversationSnapshot,
  type EmbodiedAgent,
  type MessageEmbodiment,
  type ResolvedWorldTheme,
  type WorldTheme,
} from '@chatlychat/core';
import { Group, Raycaster, Vector2, Vector3, type Object3D } from 'three';

import { AgentBody } from './agent.js';
import {
  MAX_BUBBLES,
  anchorBubble,
  animateTyping,
  createTyping,
  defaultBubble,
  speakerKind,
  type LiveBubble,
} from './bubble.js';
import { CapabilityRegistry } from './capabilities.js';
import { createComposer } from './composer.js';
import { type HandlerHooks } from './handlers.js';
import { Gaze, attachController, pickRay, type Hit } from './input.js';
import { cachedLoader, gltfLoader } from './model.js';
import { Motion, enter } from './motion.js';
import {
  PanelRig,
  defaultComposer,
  defaultPanel,
  followMode,
  type ComposerState,
} from './panel.js';
import { createPicks, named } from './picks.js';
import { Selection } from './selection.js';
import { ensureFont } from './text.js';
import { WORLD_CONTRACT, WorldError, type SoundKind, type WorldOptions } from './types.js';
import { readVisemes } from './visemes.js';

import type { ChatlyWorld } from './world-api.js';

// A panel that tracks the head exactly is nauseating, so `locked` is not offered.
const FOLLOWS = ['none', 'lazy'] as const;

export type { ChatlyWorld } from './world-api.js';

export function createWorld(opts: WorldOptions): ChatlyWorld {
  const { conversation, camera } = opts;
  const now = opts.now ?? ((): number => Date.now());
  const onError = opts.onError ?? ((): void => undefined);
  const announce = opts.announce ?? ((): void => undefined);
  const r = opts.renderers;
  if (r?.contract !== undefined && r.contract !== WORLD_CONTRACT.version) {
    throw new WorldError(
      'unsupported_contract',
      `renderers were written for contract ${String(r.contract)}; this world speaks ${String(WORLD_CONTRACT.version)}`,
    );
  }

  const readReduced = (): boolean =>
    typeof opts.reducedMotion === 'function' ? opts.reducedMotion() : (opts.reducedMotion ?? false);
  let reduced = readReduced();
  let baseTheme: WorldTheme | null = opts.theme ?? null;
  let layers = opts.themeLayers ?? [];
  let scene = opts.scene ?? 'light';
  const resolve = (): ResolvedWorldTheme =>
    resolveWorldTheme(baseTheme ?? {}, { scene, layers, reducedMotion: reduced });
  let theme = resolve();
  ensureFont(theme.fontUrl);
  const placement = resolveWorldPlacement(opts.placement, {
    ...opts.abilities,
    follow: (opts.abilities?.follow ?? FOLLOWS).filter((f) => f !== 'locked'),
    hud: false,
  });

  const root = new Group();
  root.name = WORLD_CONTRACT.objects.root;
  const motion = new Motion(reduced);
  const selection = new Selection();
  const capabilities = new CapabilityRegistry(announce);
  const rawLoad =
    opts.loadModel ?? gltfLoader(opts.loadVrm === undefined ? {} : { loadVrm: opts.loadVrm });
  const loadModel = cachedLoader(rawLoad);
  // The avatar is loaded once and owned; a clone of a skinned mesh would share its skeleton.
  const agent = new AgentBody(theme, rawLoad, onError, reduced);
  const anchors = opts.anchors ?? {};
  let agentNode: Object3D | null = null;
  root.add(agent.root);
  const rig = new PanelRig(root, placement, followMode(placement, opts.follow));
  const unbind = capabilities.bind(conversation);

  const hooks: HandlerHooks = {
    hostEvent: async (event, data, action) => {
      if (capabilities.has(event)) {
        const rep = await capabilities.invoke(event, data, false);
        await conversation.reportAction({
          messageId: action.messageId,
          actionId: action.actionId,
          status: rep.status,
          ...(rep.text === null ? {} : { text: rep.text }),
        });
        return true;
      }
      opts.onHostEvent?.(event, data);
      return opts.onHostEvent !== undefined;
    },
    openUrl: (href) => opts.onOpenUrl?.(href),
    ...(opts.onNavigate === undefined ? {} : { navigate: opts.onNavigate }),
  };

  const sound = (kind: SoundKind, at?: Object3D): void => {
    const url = theme[`sound${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)}` as 'soundSend'];
    if (url !== null) {
      opts.onSound?.({
        kind,
        url,
        volume: theme.soundVolume,
        spatial: theme.soundSpatial && at !== undefined,
        position: at === undefined ? null : at.getWorldPosition(new Vector3()),
      });
    }
  };

  const { grid, select, release, showGrid } = createPicks({
    conversation,
    camera,
    renderers: r,
    anchors,
    theme: () => theme,
    reduced: () => reduced,
    placement,
    root,
    motion,
    selection,
    hooks,
    loadModel,
    onError,
    sound,
  });

  /* ─────────────────────────── speech and panel ───────────────────────── */

  const bubbles: LiveBubble[] = [];
  let typing: Object3D | null = null;
  const seen = new Set<string>();
  let primed = false;
  const bubbleOf = (m: ConversationMessage): Object3D =>
    named(
      (r?.renderBubble ?? defaultBubble)({
        theme,
        placement,
        reducedMotion: reduced,
        message: m,
        embodiment: messageEmbodiment(m),
        streaming: m.streamState === 'streaming',
      }),
      WORLD_CONTRACT.objects.bubble,
    );
  const speakerFor = (m: ConversationMessage): Object3D | null =>
    speakerKind(m) === 'visitor'
      ? (anchors.visitor ?? null)
      : (anchors.speaker?.(m.authorId) ?? agentNode ?? agent.root);

  const addBubble = (m: ConversationMessage): void => {
    const speaker = speakerFor(m);
    if (speaker === null || m.body === '') {
      return;
    }
    const node = bubbleOf(m);
    root.add(node);
    enter(motion, node, theme.motionEntrance);
    bubbles.push({ messageId: m.id, speaker, node, body: m.body, bornAt: now() });
    while (bubbles.length > MAX_BUBBLES) {
      bubbles.shift()?.node.removeFromParent();
    }
  };

  const composer = createComposer({
    conversation,
    onError,
    onSent: () => sound('send', anchors.visitor ?? undefined),
    onChange: (composingChanged) => {
      if (composingChanged) {
        sync(conversation.getSnapshot());
      }
      redrawPanel(conversation.getSnapshot());
    },
  });
  const composerView: ComposerState = {
    get draft() {
      return composer.draft;
    },
    submit: () => void composer.submit(),
    requestInput: () => opts.onComposeRequest?.(),
  };

  let panel: Object3D | null = null;
  let composerNode: Object3D | null = null;
  function redrawPanel(snap: ConversationSnapshot): void {
    panel?.removeFromParent();
    composerNode?.removeFromParent();
    const ctx = { theme, placement, reducedMotion: reduced };
    panel = named(
      (r?.renderPanel ?? defaultPanel)({
        ...ctx,
        conversation: conversation as never,
        messages: snap.messages,
        typing: snap.typing,
      }),
      WORLD_CONTRACT.objects.panel,
    );
    const cprops = {
      ...ctx,
      send: async (body: string): Promise<void> => {
        await conversation.send(body);
      },
      setComposing: (c: boolean): void => composer.setComposing(c),
      disabled: snap.connection === 'closed' || composer.busy,
    };
    composerNode = named(
      r?.renderComposer !== undefined
        ? r.renderComposer(cprops)
        : defaultComposer(cprops, composerView, placement.widthMetres),
      WORLD_CONTRACT.objects.composer,
    );
    const ph = ((panel.userData['size'] as [number, number] | undefined) ?? [0, 0.3])[1];
    const ch = ((composerNode.userData['size'] as [number, number] | undefined) ?? [0, 0.07])[1];
    panel.position.y = 0;
    composerNode.position.y = -(ph / 2 + ch / 2 + 0.02);
    rig.group.add(panel, composerNode);
  }

  /* ───────────────────────────── snapshot sync ────────────────────────── */

  let lastState: string | null = null;
  let lastCue: MessageEmbodiment | null = null;
  let cueSeq = 0;
  let agentKey = '';
  /** A host's own agent body, when it supplied `renderAgent`; the default body hides behind it. */
  const drawAgent = (view: EmbodiedAgent): void => {
    if (r?.renderAgent === undefined) {
      return;
    }
    const key = `${view.state}|${view.presence?.name ?? ''}|${String(cueSeq)}`;
    if (key === agentKey) {
      return;
    }
    agentKey = key;
    const node = named(
      r.renderAgent({
        theme,
        placement,
        reducedMotion: reduced,
        agent: view,
        embodiment: lastCue,
        expressionClip: expressionClip(view.presence, lastCue),
      }),
      WORLD_CONTRACT.objects.agent,
    );
    if (node !== agentNode) {
      agentNode?.removeFromParent();
      agentNode = node;
      root.add(node);
    }
    agent.root.visible = false;
    agent.root.name = `${WORLD_CONTRACT.objects.agent}-default`;
  };
  const agentView = (snap: ConversationSnapshot): void => {
    const view = embodiedAgent(snap, {
      ...(opts.presences === undefined ? {} : { presences: opts.presences }),
      visitorComposing: composer.composing,
    });
    agent.setPresence(view.presence);
    agent.setState(view.state);
    drawAgent(view);
    if (view.state !== lastState) {
      lastState = view.state;
      if (view.described !== null) {
        announce(view.described);
      }
    }
  };

  function sync(snap: ConversationSnapshot): void {
    if (snap.loaded && !primed) {
      // History is not replayed as speech: only what arrives from here on.
      primed = true;
      for (const m of snap.messages) {
        if (!m.pending) {
          seen.add(m.id);
        }
      }
      const lastCards = [...snap.messages]
        .reverse()
        .find((m) => m.blocks?.blocks.some((b) => b.type === 'card_grid' || b.type === 'card'));
      if (lastCards !== undefined) {
        showGrid(lastCards);
      }
    } else if (primed) {
      for (const m of snap.messages) {
        if (
          m.pending ||
          seen.has(m.id) ||
          m.deletedAt !== null ||
          m.hiddenFromContact ||
          m.kind === 'system_event'
        ) {
          continue;
        }
        seen.add(m.id);
        addBubble(m);
        const fromAgent = speakerKind(m) === 'agent';
        if (fromAgent) {
          sound('receive', agent.root);
          announce(m.body);
          const cue = messageEmbodiment(m);
          lastCue = cue;
          cueSeq += 1;
          agent.express(cue?.expression ?? null);
          agent.playExpression(expressionClip(agent.presence, cue));
          if (cue?.lookAt != null) {
            const t = cue.lookAt;
            agent.lookAt(t.target === 'visitor' ? 'visitor' : (anchors.resolve?.(t.ref) ?? null));
          }
          agent.setVisemes(readVisemes(m), now());
        }
        if (m.blocks?.blocks.some((b) => b.type === 'card_grid' || b.type === 'card')) {
          showGrid(m);
        }
      }
      // A streaming reply grows in place.
      for (const b of bubbles) {
        const m = snap.messages.find((x) => x.id === b.messageId);
        if (m !== undefined && m.body !== b.body) {
          const next = bubbleOf(m);
          next.position.copy(b.node.position);
          b.node.parent?.add(next);
          b.node.removeFromParent();
          b.node = next;
          b.body = m.body;
        }
      }
    }
    if (snap.typing !== null && theme.typingLook !== 'none' && theme.typingLook !== 'avatar') {
      if (typing === null) {
        typing = createTyping(theme);
        root.add(typing);
      }
    } else if (typing !== null) {
      typing.removeFromParent();
      typing = null;
    }
    agentView(snap);
    redrawPanel(snap);
  }

  const unsubscribe = conversation.subscribe(() => sync(conversation.getSnapshot()));
  rig.group.userData['rig'] = true;
  sync(conversation.getSnapshot());

  /* ───────────────────────────────── frame ────────────────────────────── */

  const activate = (hit: Hit): void => hit.activate();
  const ndc = new Vector2();

  const world: ChatlyWorld = {
    root,
    capabilities,
    selection,
    agent,
    composer,
    get theme() {
      return theme;
    },
    placement,
    get reducedMotion() {
      return reduced;
    },
    update(dtSeconds) {
      const next = readReduced();
      if (next !== reduced) {
        world.setReducedMotion(next);
      }
      const dt = dtSeconds * 1000;
      const t = now();
      motion.update(dt);
      agent.update(dt, t, camera);
      rig.update(dt, {
        camera,
        reduced,
        agent: agentNode ?? agent.root,
        place: placement.ref === null ? null : (anchors.resolve?.(placement.ref) ?? null),
        wrist: anchors.wrist ?? null,
      });
      for (let i = bubbles.length - 1; i >= 0; i -= 1) {
        const b = bubbles[i] as LiveBubble;
        if (t - b.bornAt > theme.bubbleDurationMs) {
          b.node.removeFromParent();
          bubbles.splice(i, 1);
        }
      }
      bubbles.forEach((b, slot) =>
        anchorBubble(b.node, b.speaker, camera, bubbles.length - 1 - slot, root),
      );
      if (typing !== null) {
        animateTyping(typing, t, reduced);
        anchorBubble(typing, agentNode ?? agent.root, camera, bubbles.length, root);
      }
      const g = grid();
      if (g !== null && !reduced) {
        for (const { node } of g.nodes.values()) {
          if (node.userData['float'] === true) {
            node.position.y += Math.sin(t / 700 + node.position.x * 3) * 0.0004 * dt;
          }
        }
      }
    },
    pick: (origin, direction) => pickRay(root, origin, direction),
    pickAtPointer(x, y) {
      const ray = new Raycaster();
      ray.setFromCamera(ndc.set(x, y), camera);
      return pickRay(root, ray.ray.origin, ray.ray.direction);
    },
    activate,
    attachController: (c) => attachController(root, c, activate),
    attachGaze: (o) => new Gaze(root, camera, o?.dwellMs ?? 1500, activate),
    setReducedMotion(v) {
      reduced = v;
      motion.reduced = v;
      agent.reduced = v;
      world.setTheme(baseTheme, layers);
    },
    setTheme(th, l) {
      baseTheme = th;
      layers = l ?? layers;
      theme = resolve();
      agent.setTheme(theme);
      ensureFont(theme.fontUrl);
      sync(conversation.getSnapshot());
      const g = grid();
      if (g !== null) {
        showGrid(g.message);
      }
    },
    setScene(s) {
      scene = s;
      world.setTheme(baseTheme, layers);
    },
    select,
    release,
    cardKeys: () => [...(grid()?.nodes.keys() ?? [])],
    dispose() {
      unsubscribe();
      unbind();
      motion.clear();
      agent.dispose();
      root.removeFromParent();
      root.traverse((o) => {
        const m = o as {
          geometry?: { dispose(): void };
          material?: { dispose(): void } | { dispose(): void }[];
        };
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material)
          ? m.material
          : m.material === undefined
            ? []
            : [m.material]) {
          mat.dispose();
        }
      });
    },
  };
  return world;
}
