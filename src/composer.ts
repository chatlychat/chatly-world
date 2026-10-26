/**
 * The composer's state: a draft the HOST fills (a virtual keyboard, dictation,
 * a DOM overlay, voice) and a submit the world sends. Typing in a headset is
 * the host's problem; what is ours is that composing turns the agent's body to
 * listen, so the draft going empty/non-empty is reported to the conversation.
 */
import type { ConversationLike } from './types.js';

export interface Composer {
  readonly draft: string;
  readonly composing: boolean;
  readonly busy: boolean;
  setDraft(text: string): void;
  /** Report composing without a draft (a custom composer with its own field). */
  setComposing(composing: boolean): void;
  submit(): Promise<void>;
}

export interface ComposerDeps {
  readonly conversation: ConversationLike;
  readonly onError: (e: unknown) => void;
  readonly onSent: () => void;
  /** The draft changed; `composingChanged` when it crossed empty/non-empty. */
  readonly onChange: (composingChanged: boolean) => void;
}

export function createComposer(d: ComposerDeps): Composer {
  let draft = '';
  let composing = false;
  let busy = false;
  const flip = (next: boolean): boolean => {
    if (next === composing) {
      return false;
    }
    composing = next;
    d.conversation.setTyping(next);
    return true;
  };
  const composer: Composer = {
    get draft() {
      return draft;
    },
    get composing() {
      return composing;
    },
    get busy() {
      return busy;
    },
    setDraft(text) {
      draft = text;
      d.onChange(flip(text !== ''));
    },
    setComposing(c) {
      if (flip(c)) {
        d.onChange(true);
      }
    },
    async submit() {
      const body = draft.trim();
      if (body === '' || busy) {
        return;
      }
      busy = true;
      try {
        await d.conversation.send(body);
        composer.setDraft('');
        d.onSent();
      } catch (e) {
        d.onError(e);
      } finally {
        busy = false;
      }
    },
  };
  return composer;
}
