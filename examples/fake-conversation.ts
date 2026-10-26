/**
 * An in-memory conversation: enough of the core's `Conversation` to render a
 * scripted exchange with no network. In a real app you get the real one from
 * `createChatlyCore({ publicId, ... }).startConversation(...)`.
 */
import type {
  ConversationMessage,
  ConversationSnapshot,
  HostCapabilityInvocation,
} from '@chatlychat/core';
import type { ConversationLike } from '@chatlychat/world';

export function message(over: Partial<ConversationMessage> & { id: string }): ConversationMessage {
  return {
    conversationId: 'demo',
    body: '',
    authorType: 'bot',
    createdAt: new Date().toISOString(),
    kind: 'text',
    bodyHtml: null,
    blocks: null,
    canvas: null,
    attachments: [],
    authorId: 'mia',
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

export function createFakeConversation() {
  let snap: ConversationSnapshot = {
    conversationId: 'demo',
    messages: [],
    typing: null,
    connection: 'live',
    loaded: true,
    error: null,
    agentReadUpTo: null,
  };
  const listeners = new Set<() => void>();
  const capability = new Set<(i: HostCapabilityInvocation) => void>();
  const set = (patch: Partial<ConversationSnapshot>): void => {
    snap = { ...snap, ...patch };
    listeners.forEach((l) => l());
  };
  const push = (m: ConversationMessage): void => set({ messages: [...snap.messages, m] });
  const log = (...a: unknown[]): void => console.log('[conversation]', ...a);

  const conversation = {
    conversationId: 'demo',
    getSnapshot: () => snap,
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    onCapability: (h: (i: HostCapabilityInvocation) => void) => (
      capability.add(h), () => capability.delete(h)
    ),
    postback: (p: { body: string; payload?: unknown }) => {
      log('postback', p);
      push(
        message({
          id: `v${snap.messages.length}`,
          authorType: 'contact',
          authorId: null,
          body: p.body,
        }),
      );
      return Promise.resolve();
    },
    send: (body: string) => {
      push(
        message({ id: `v${snap.messages.length}`, authorType: 'contact', authorId: null, body }),
      );
      return Promise.resolve();
    },
    react: () => Promise.resolve({}),
    setTyping: () => undefined,
    requestStep: () => Promise.resolve({}),
    reportAction: (r: unknown) => (log('reportAction', r), Promise.resolve({})),
  } as unknown as ConversationLike;

  return {
    conversation,
    set,
    push,
    fire: (i: Partial<HostCapabilityInvocation> & { capability: string }): void =>
      capability.forEach((h) =>
        h({
          invocationId: 'inv-1',
          messageId: 'm1',
          surfaceId: 'world',
          args: {},
          expiresAt: '2099-01-01T00:00:00Z',
          ...i,
        }),
      ),
  };
}
