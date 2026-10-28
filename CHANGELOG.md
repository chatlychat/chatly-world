# @chatlychat/world

## 0.4.0 — 2026-10-28

A minor, not a patch: `ConversationLike` requires one more method, so a host that structurally types its own conversation object must add it.

- `ConversationLike` includes `requestCards`. `dispatchPress` needs it to serve a `cards` action — the button a visitor presses to pull their own order or subscription data from the operator's backend — and requiring it here is what stops a world rendering that button and silently doing nothing.
- Peer range on `@chatlychat/core` widened to `>=0.5.0 <0.9.0` for that release.

## 0.3.1 — 2026-10-26

- The `@chatlychat/core` peer range is `>=0.5.0 <0.7.0`, so core 0.6.0 (navigate as a card tap and `more` tile) installs beside it. Nothing in world indexes presses by position.

## 0.3.0 — 2026-10-26

- Card `press` now calls the core's `dispatchPress`, the same code as `conversation.press`, so the two cannot disagree. Behaviour is unchanged for `postback`, `step`, `host_event` and `url`.
- New `onNavigate(action)` option for a `navigate` card action.
- The `@chatlychat/core` peer range is `>=0.5.0 <0.6.0`: this version imports `dispatchPress`, which core 0.5.0 introduced, so 0.3.x/0.4.x would fail at load.

## 0.2.1 — 2026-10-26

The `@chatlychat/core` peer range is `>=0.3.1 <0.5.0`. It was `^0.3.1`, which on a 0.x version allows 0.3.x only, so installing world beside core 0.4.0 reported an unmet peer. No code change; the suite passes against core 0.4.0.

## 0.2.0 — 2026-10-26

Not yet published.

- VRM avatars. An avatar with `format: 'vrm'`, or a glTF carrying the `VRM` / `VRMC_vrm` extension, loads through `@pixiv/three-vrm`'s `VRMLoaderPlugin`. `@pixiv/three-vrm` (`^3.5.5`) is an OPTIONAL peer dependency, loaded by dynamic import; a glTF-only host does not install or bundle it. Missing, it is a `WorldError` with code `missing_peer` naming the package. Bundlers: pass `loadVrm: () => import('@pixiv/three-vrm')`.
- The mouth on a VRM avatar is driven through the `aa` / `ih` / `ou` / `ee` / `oh` expression bindings (`VISEME_TO_VRM`), not morph targets.
- `embodiment.expression` maps to the `happy`, `sad` and `surprised` presets (`EXPRESSION_TO_VRM`); gestures stay clips. Automatic blink (off under reduced motion).
- `lookAt` drives VRM's `lookAt.target` and the humanoid head bone. `vrm.update(delta)` runs every frame.
- `ModelLoader` takes an optional second argument `{ format }`; `LoadedModel` has an optional `vrm`; `WorldErrorCode` gains `missing_peer`; new `loadVrm` option and `gltfLoader({ loadVrm })`.
- The glTF morph-target path is unchanged.

## 0.1.0 — 2026-10-25

Unpublished. The first version: a Chatly conversation rendered into your three.js scene.

- `createWorld({ conversation, camera, … })` → `world.root` (add it to your scene) and `world.update(dt)` (call it from your loop).
- Picks: a `card_grid` laid out as `arc`, `shelf`, `wall` or `table`; `card.model` loaded with three's `GLTFLoader` (scale and anchor honoured); pedestal, beam, price label and selection ring from `worldTheme`. Tapping a pick selects it in the conversation (a postback) and the selection is shared with the host.
- Speech bubbles anchored to a speaker (never head-locked), scaled by distance, with a typing indicator.
- A world-space panel and composer; `fixed`, `lazy` and `wrist` follow; a `locked` placement is honoured as `lazy`.
- Hand, controller (`attachController`), gaze-dwell (`attachGaze`) and pointer (`pickAtPointer`) picking. The host keeps input.
- An embodied agent body: avatar model, `idle`/`listening`/`thinking`/`speaking` clips, expression and `lookAt` cues, viseme-driven mouth when a message carries `metadata.visemes`.
- Host capabilities: `world.walk_to`, `avatar.try_on`, `scene.highlight`, `scene.spawn` and custom names, dispatched to handlers you register; bot-fired invocations are answered into the thread; every action keeps its `equivalent`.
- Replaceable `renderCard`, `renderPick`, `renderBubble`, `renderPanel`, `renderComposer`, `renderAgent`, with a named, versioned object contract (`WORLD_CONTRACT`).
- `worldTheme` applied to panel, type, cards, speech, agent, sound cues and motion; reduced motion always wins.
