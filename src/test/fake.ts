/** A conversation stand-in and a few builders. Scene-graph specs only: no GL, no DOM, no network. */
import { PerspectiveCamera } from 'three';

import type { ConversationLike } from '../types.js';
import type {
  Block,
  ConversationMessage,
  ConversationSnapshot,
  HostCapabilityInvocation,
  PostbackInput,
} from '@chatlychat/core';

export function msg(over: Partial<ConversationMessage> & { id: string }): ConversationMessage {
  return {
    conversationId: 'c1',
    body: '',
    authorType: 'bot',
    createdAt: '2026-10-25T12:00:00.000Z',
    kind: 'text',
    bodyHtml: null,
    blocks: null,
    canvas: null,
    attachments: [],
    authorId: 'bot-1',
    streamState: 'complete',
    hiddenFromContact: false,
    replyToMessageId: null,
    metadata: {},
    deletedAt: null,
    reactions: [],
    pending: false,
    ...over,
  };
}

export const withBlocks = (
  id: string,
  blocks: Block[],
  over: Partial<ConversationMessage> = {},
): ConversationMessage => msg({ id, kind: 'rich', blocks: { v: 1, blocks }, ...over });

export function grid(placement: string, titles: string[]): Block {
  return {
    type: 'card_grid',
    placement,
    cards: titles.map((title, i) => ({
      id: `k${String(i)}`,
      title,
      price: { amount: 10900, currency: 'GBP' },
    })),
  };
}

export function fakeConversation(initial: Partial<ConversationSnapshot> = {}) {
  let snap: ConversationSnapshot = {
    conversationId: 'c1',
    messages: [],
    typing: null,
    connection: 'live',
    loaded: true,
    error: null,
    agentReadUpTo: null,
    ...initial,
  };
  const listeners = new Set<() => void>();
  const capHandlers = new Set<(i: HostCapabilityInvocation) => void>();
  const calls = {
    postbacks: [] as PostbackInput[],
    sends: [] as string[],
    reactions: [] as [string, string][],
    reports: [] as Record<string, unknown>[],
    typing: [] as boolean[],
    steps: [] as string[],
  };
  const state = { failPostback: false };
  const conv = {
    conversationId: 'c1',
    getSnapshot: () => snap,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    onCapability: (h: (i: HostCapabilityInvocation) => void) => {
      capHandlers.add(h);
      return () => capHandlers.delete(h);
    },
    postback: (p: PostbackInput) => {
      calls.postbacks.push(p);
      return state.failPostback ? Promise.reject(new Error('offline')) : Promise.resolve();
    },
    send: (b: string) => {
      calls.sends.push(b);
      return Promise.resolve();
    },
    react: (id: string, emoji: string) => {
      calls.reactions.push([id, emoji]);
      return Promise.resolve({});
    },
    setTyping: (t: boolean) => void calls.typing.push(t),
    requestStep: (id: string) => {
      calls.steps.push(id);
      return Promise.resolve({});
    },
    reportAction: (r: Record<string, unknown>) => {
      calls.reports.push(r);
      return Promise.resolve({});
    },
  } as unknown as ConversationLike;
  return {
    conv,
    calls,
    state,
    set(patch: Partial<ConversationSnapshot>): void {
      snap = { ...snap, ...patch };
      for (const l of [...listeners]) {
        l();
      }
    },
    push(...m: ConversationMessage[]): void {
      this.set({ messages: [...snap.messages, ...m] });
    },
    fire(inv: Partial<HostCapabilityInvocation> & { capability: string }): void {
      for (const h of capHandlers) {
        h({
          invocationId: 'inv-1',
          messageId: 'm-9',
          surfaceId: 'world',
          args: {},
          expiresAt: '2099-01-01T00:00:00.000Z',
          ...inv,
        });
      }
    },
  };
}

export function viewerCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(70, 1, 0.1, 100);
  cam.position.set(0, 1.6, 0); // looks down -z by default
  cam.updateMatrixWorld(true);
  return cam;
}

/** Let queued promise continuations (model loads, report calls) run. */
export const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
