/**
 * The three things a visitor can do to a block, as the calls the core already
 * makes. Handed to every renderer — default or override — unchanged.
 */
import { dispatchPress } from '@chatlychat/core';

import { WorldError } from './types.js';

import type { ConversationLike } from './types.js';
import type { BlockHandlers, ConversationMessage, PressableAction } from '@chatlychat/core';

export type CardAction = PressableAction;

export interface HandlerHooks {
  /** A host_event press. Resolves to whether something claimed it. */
  readonly hostEvent: (
    event: string,
    data: Readonly<Record<string, unknown>>,
    action: { readonly messageId: string; readonly actionId: string },
  ) => Promise<boolean>;
  readonly openUrl: (href: string) => void;
  /** A `navigate` card action; the whole action, for the host's router. */
  readonly navigate?: (action: PressableAction) => Promise<void> | void;
}

/** A card's own actions, by explicit `id` or by position (`a0`, `a1`…). */
export function cardActions(block: Readonly<Record<string, unknown>>): readonly CardAction[] {
  return Array.isArray(block['actions']) ? (block['actions'] as CardAction[]) : [];
}

export function makeHandlers(
  conversation: ConversationLike,
  message: ConversationMessage,
  title: string,
  actions: readonly CardAction[],
  hooks: HandlerHooks,
): BlockHandlers {
  return {
    select: (payload) => conversation.postback({ body: title, payload: { ...payload } }),
    react: async (emoji) => {
      await conversation.react(message.id, emoji);
    },
    press: async (actionId) => {
      const idx = actions.findIndex((a, i) => (a.id ?? `a${String(i)}`) === actionId);
      const a = idx < 0 ? undefined : actions[idx];
      if (a === undefined) {
        throw new WorldError('unknown_action', `no action "${actionId}" on this block`);
      }
      // One dispatch, shared with `conversation.press` in the core.
      await dispatchPress(
        conversation,
        a,
        { messageId: message.id, actionId },
        {
          onHostEvent: (event, data, ref) => hooks.hostEvent(event, data, ref),
          onOpenUrl: hooks.openUrl,
          ...(hooks.navigate === undefined ? {} : { onNavigate: hooks.navigate }),
        },
      );
    },
  };
}
