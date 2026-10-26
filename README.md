# @chatlychat/world

A Chatly conversation, rendered into **your** three.js scene. You keep the scene,
the avatars, the input and the wayfinding; this draws what the conversation
contains and sends the visitor's taps back.

```bash
pnpm add @chatlychat/world @chatlychat/core three
```

`three` (>= 0.160) and `@chatlychat/core` are peer dependencies. The only other
is **optional**: `@pixiv/three-vrm`, for VRM avatars (see below). Nothing here
touches the web widget.

```ts
import { createChatlyCore } from '@chatlychat/core';
import { createWorld } from '@chatlychat/world';
import { Clock } from 'three';

const core = createChatlyCore({ publicId: 'pub_xxx', socket: io });
const conversation = await core.startConversation('Do you have this in blue?');

const world = createWorld({
  conversation,
  camera, // the camera (or XR camera) the visitor sees through
  theme: core.worldTheme, // the channel's worldTheme
  scene: 'light', // what your scene's light is, for colorScheme "auto"
  reducedMotion: () => false, // return your viewer's reduced-motion setting
  presences: { '*': { name: 'Mia', avatar: { url: 'https://cdn.example/mia.glb' } } },
});
scene.add(world.root);

const clock = new Clock();
renderer.setAnimationLoop(() => {
  world.update(clock.getDelta()); // seconds
  renderer.render(scene, camera);
});
```

## What it draws

- **Picks.** A `card_grid` with `placement` `arc`, `shelf`, `wall` or `table`;
  a card with a `model` becomes a glTF object (`scale` and `anchor` honoured)
  with the theme's pedestal, beam, price label and selection ring. Tapping one
  selects it: a postback to the conversation, a ring on the card, the object in
  hand. `world.selection` is shared — selecting from your own UI is the same event
  (`await world.select(key)`; keys from `world.cardKeys()`).
- **Speech bubbles** over a speaker, turned to the viewer and scaled by distance —
  positioned from the speaker, never from the camera. Typing indicator per
  `typingLook`. History is not replayed as speech.
- **A world-space panel and composer.** Never head-locked: `fixed`, `lazy` (an
  eased follow with a dead zone) or `wrist` (carried on a controller you pass).
  `follow: 'locked'` in a placement is honoured as `lazy`.
  Typing is yours: fill `world.composer.setDraft(text)` from your keyboard, mic or
  overlay (`onComposeRequest` fires when the field is pressed), then it sends.
- **An agent body**: avatar model (glTF or VRM; `usdz` is refused with a typed error),
  `idle`/`listening`/`thinking`/`speaking` clips from `presence.clips`, one-shot
  `expressions`, `lookAt` cues resolved through `anchors.resolve(ref)`, and a mouth
  driven by `message.metadata.visemes` (`[{ t: ms, v: 'aa', w?: 0..1 }]`) when
  present. `presence.idle` and `personalSpaceMetres` are yours to honour.

## VRM avatars

An avatar whose `format` is `vrm` (or whose file carries the VRM extension) is
loaded through `@pixiv/three-vrm`'s `VRMLoaderPlugin`. The package is an
**optional** peer dependency: a glTF-only host does not install it, and nothing
of it is in your bundle.

```bash
npm install @pixiv/three-vrm   # ^3.5.5; VRM avatars only
```

If you bundle, hand the import over so your bundler can see the package:

```ts
createWorld({ conversation, camera, loadVrm: () => import('@pixiv/three-vrm') });
```

Without it installed, a VRM avatar reports a `WorldError` with code `missing_peer`
to `onError`, names the package, and the placeholder body stays.

**Mouth.** Chatly visemes drive VRM's five expression bindings
(`aa`, `ih`, `ou`, `ee`, `oh`) instead of morph targets. Names are case-insensitive
and a `viseme_` prefix is ignored.

| Chatly viseme                 | VRM expression | Opening                    |
| ----------------------------- | -------------- | -------------------------- |
| `aa`                          | `aa`           | full                       |
| `ih`, `I`                     | `ih`           | full                       |
| `ou`, `U`                     | `ou`           | full                       |
| `ee`, `E`                     | `ee`           | full                       |
| `oh`, `O`                     | `oh`           | full                       |
| `FF`, `TH`, `SS`              | `ih`           | 0.4, 0.5, 0.5              |
| `DD`, `kk`                    | `aa`           | 0.4                        |
| `CH`, `RR`                    | `ou`           | 0.5                        |
| `nn`                          | `ih`           | 0.3                        |
| `PP`, `sil`, anything unknown | none           | closed (all five set to 0) |

The opening is multiplied by the track's own `w`. The five are always set
together, so a released mouth closes.

**Face.** `embodiment.expression` maps to a VRM preset where one exists:

| Expression  | Preset      | Weight |
| ----------- | ----------- | ------ |
| `smile`     | `happy`     | 0.7    |
| `laugh`     | `happy`     | 1      |
| `surprised` | `surprised` | 1      |
| `concerned` | `sad`       | 0.6    |

The face eases in over 0.12 s, holds 2.5 s and fades over 0.5 s. `nod`,
`shake_head`, `point`, `wave`, `shrug` and `think` are gestures with no preset:
they play only as your own clip from `presence.expressions`, as on a glTF avatar.
A preset and a host clip both play if both exist. No Chatly expression is
`angry` or `relaxed`, so those presets are never driven. `blink` is automatic
(every 4 s) and off under reduced motion; there, a face is applied and removed
without easing.

**Gaze.** A `lookAt` cue sets VRM's `lookAt.target` (eyes) and turns the humanoid
`head` bone toward it, clamped to about 20 degrees up or down and 34 degrees sideways.
The body still turns on the spot as before. **Clips.** State and expression clips
in the file play on the model as they do for glTF; the SDK does not retarget
clips from other rigs (such as separate VRMA files) — load those yourself.
`vrm.update(delta)` runs every `world.update`.

The glTF morph-target path (`v`, `viseme_v`, `Viseme_v`) is unchanged.

## Input

The host owns input; the world only knows which of its objects a ray hit.

```ts
world.attachController(xrController); // your XR controller object: trigger or hand pinch
const gaze = world.attachGaze({ dwellMs: 1500 }); // call gaze.update(ms) per frame
const hit = world.pickAtPointer(ndcX, ndcY); // mouse / touch
if (hit) world.activate(hit);
```

## Host capabilities

```ts
world.capabilities.register(
  'world.walk_to', // also: avatar.try_on, scene.highlight, scene.spawn, or your own
  async () => true, // do your own movement here; return false or throw to refuse
  { equivalent: { kind: 'text', text: 'The shop is on level 2.' }, unprompted: true },
);
await core.setSurface(world.capabilities.surface({ room: 'atrium' }));
```

A bot-fired invocation reaches your handler and is answered into the thread
(`done`, or `failed` + `refused: true`). The `equivalent` is required and is
announced (`announce`) whenever the handler is missing, refuses or throws.

## Replaceable renderers

`renderCard`, `renderPick`, `renderBubble`, `renderPanel`, `renderComposer`,
`renderAgent` — each receives the typed block (or message, or agent view), the
resolved `theme` and `placement`, `reducedMotion`, and for blocks the Chatly
handlers `select`, `press` and `react`. Return any `Object3D`.

```ts
createWorld({ …, renderers: { contract: 1, renderCard: (p) => yourShelfMesh } });
```

The world names an override's node `cl3-card` etc. if you did not, and routes
taps on it to selection (set `userData.cl3Handled = true` to take taps yourself).
Object names and the renderer set are versioned in `WORLD_CONTRACT`; pinning
`contract: N` fails loudly on a world that speaks another N.

## Theme and reduced motion

Every `worldTheme` token is applied: panel material/colour/emissive, type
(`fontUrl`, weight, outline, `textScale`), cards, speech, agent, sound (as
`onSound` cues — you play them) and motion. `world.setTheme`, `setScene` and
`setReducedMotion` re-apply live. **Reduced motion always wins:** entrances and
trails off, lazy follow and gaze snap, expression clips skipped, clips held on
their first frame.

## Tests without WebGL

three builds a scene graph with no GL context, so you can test your integration in
Node: see `src/world.spec.ts` for a fake conversation and the assertions.
`pnpm --filter @chatlychat/world example` runs a scripted demo.

MIT.

---

## About this repository

This is a **mirror**. `@chatlychat/world` is built from a private monorepo where the rest
of the platform, its migrations and its contract checks live, so a pull request here
cannot be merged directly — but a patch is still the fastest way to get something
fixed and we will port it with attribution.

What you can do here: read the source, run the tests, open an issue, or open a PR
and we will treat the diff as the proposal.

Not mirrored: src/cards.parity.spec.ts, src/peer-range.spec.ts — specs that assert a type restated here still
matches the monorepo's original, which is only a meaningful claim inside it. They
keep running there.

Issues: https://github.com/chatlychat/chatly-world/issues · Docs: https://chatlychat.com/docs
