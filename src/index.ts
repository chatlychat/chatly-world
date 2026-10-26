/**
 * `@chatlychat/world` — a Chatly conversation in a three.js scene.
 *
 *   const world = createWorld({ conversation, camera, theme: core.worldTheme });
 *   scene.add(world.root);
 *   renderer.setAnimationLoop(() => world.update(clock.getDelta()));
 *
 * `three` and `@chatlychat/core` are peer dependencies. `@pixiv/three-vrm` is an
 * OPTIONAL peer, needed only for VRM avatars (see `vrm.ts`).
 */
export { createWorld } from './world.js';
export type { ChatlyWorld } from './world-api.js';
export type { Composer } from './composer.js';
export {
  WORLD_CONTRACT,
  WorldError,
  type ConversationLike,
  type PanelFollow,
  type SoundCue,
  type SoundKind,
  type WorldAnchors,
  type WorldErrorCode,
  type WorldNodeRenderers,
  type WorldObjectName,
  type WorldOptions,
} from './types.js';
export {
  CapabilityRegistry,
  type ActionContext,
  type ActionHandler,
  type ActionOutcome,
  type ActionReport,
  type RegisterOptions,
  type StandardAction,
  type WorldActionMap,
} from './capabilities.js';
export {
  GRID_PLACEMENTS,
  layoutCards,
  type GridLayout,
  type GridPlacement,
  type Mount,
  type Pose,
} from './layout.js';
export { bubbleScale } from './bubble.js';
export { DEAD_METRES, DEAD_YAW, lazyStep, type FollowPose, type FollowState } from './panel.js';
export {
  buildGrid,
  defaultCard,
  formatPrice,
  isHighlighted,
  readCard,
  type CardData,
} from './cards.js';
export {
  anchorOffset,
  fitModel,
  gltfLoader,
  type GltfLoaderLike,
  type GltfLoaderOptions,
  type LoadedModel,
  type ModelAnchor,
  type ModelLoader,
} from './model.js';
export { readVisemes, visemeAt, type Viseme, type VisemeTrack } from './visemes.js';
export { Selection } from './selection.js';
export { Motion } from './motion.js';
export { AgentBody, type GazeTarget } from './agent.js';
export { interactive, pickRay, type Hit, type Interactive, type InteractiveKind } from './input.js';
export {
  EXPRESSION_TO_VRM,
  VISEME_TO_VRM,
  VRM_PEER,
  VrmRig,
  hasVrmExtension,
  loadVrmModule,
  vrmVisemeFor,
  wantsVrm,
  type VrmLike,
  type VrmModule,
  type VrmModuleLoader,
  type VrmVowel,
} from './vrm.js';
