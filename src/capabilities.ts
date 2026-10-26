/**
 * Host capabilities: what the visitor's world can DO, declared to the bot and
 * dispatched to handlers the host registers.
 *
 * The world never walks, dresses or spawns anything itself — those are the
 * host's. This surfaces the four standard intents as typed handlers and keeps
 * the contract every capability carries:
 *
 *  - an `equivalent` is REQUIRED at registration, because a bot's offer must
 *    mean something to a visitor whose world cannot do it. It is announced
 *    whenever a handler is missing, declines or throws;
 *  - the host is the gate: a handler may return `false` or throw to refuse, and
 *    a refusal is reported as `failed` with `refused: true` (two refusals in ten
 *    minutes stop the bot firing it — server-side);
 *  - args are checked here against the declared shape before a handler sees
 *    them, because a bot-fired invocation is data from outside.
 */
import type { ConversationLike } from './types.js';
import type {
  CapabilityEquivalent,
  HostCapabilityDeclaration,
  HostCapabilityInvocation,
  HostSurface,
  HostSurfaceState,
} from '@chatlychat/core';

/** The standard intents and their arguments. Names are verbs, never positions. */
export interface WorldActionMap {
  'world.walk_to': { place: string };
  'avatar.try_on': { item: string };
  'scene.highlight': { ref: string };
  'scene.spawn': { ref: string };
}
export type StandardAction = keyof WorldActionMap;

const STANDARD: {
  readonly [A in StandardAction]: {
    label: string;
    description: string;
    arg: keyof WorldActionMap[A] & string;
  };
} = {
  'world.walk_to': {
    label: 'Take me there',
    description: 'Walk the visitor to a named place.',
    arg: 'place',
  },
  'avatar.try_on': {
    label: 'Try it on',
    description: "Put an item on the visitor's avatar.",
    arg: 'item',
  },
  'scene.highlight': {
    label: 'Show me',
    description: 'Highlight a named object in the scene.',
    arg: 'ref',
  },
  'scene.spawn': {
    label: 'Bring it here',
    description: 'Place a named object in front of the visitor.',
    arg: 'ref',
  },
};

const ARG_MAX = 40;

/** What a handler may answer. `false` or a throw is a refusal; `void`/`true` is done. */
export type ActionOutcome = void | boolean | { readonly ok: boolean; readonly text?: string };

export interface ActionContext {
  readonly equivalent: CapabilityEquivalent;
  /** True when the bot fired it without a press. */
  readonly unprompted: boolean;
}

export type ActionHandler<A extends Readonly<Record<string, unknown>>> = (
  args: A,
  ctx: ActionContext,
) => ActionOutcome | Promise<ActionOutcome>;

export interface RegisterOptions {
  /** What a person or screen reader gets instead of the world doing it. Required. */
  readonly equivalent: CapabilityEquivalent;
  /** Let the bot fire it without a press. Off by default. */
  readonly unprompted?: boolean;
  readonly label?: string;
  readonly description?: string;
  /** Required for a custom (non-standard) name; a small JSON-Schema subset. */
  readonly args?: Readonly<Record<string, unknown>>;
}

interface Entry {
  readonly decl: HostCapabilityDeclaration;
  readonly handler: ActionHandler<Readonly<Record<string, unknown>>>;
  readonly argName: string | null;
}

export interface ActionReport {
  readonly status: 'done' | 'failed';
  readonly refused: boolean;
  readonly text: string | null;
}

const equivalentText = (e: CapabilityEquivalent): string =>
  e.kind === 'text' ? e.text : (e.text ?? e.href);

export class CapabilityRegistry {
  private readonly entries = new Map<string, Entry>();

  public constructor(private readonly announce: (text: string) => void = () => undefined) {}

  public register<N extends StandardAction>(
    name: N,
    handler: ActionHandler<WorldActionMap[N]>,
    opts: RegisterOptions,
  ): () => void;
  public register(
    name: string,
    handler: ActionHandler<Readonly<Record<string, unknown>>>,
    opts: RegisterOptions,
  ): () => void;
  public register(name: string, handler: ActionHandler<never>, opts: RegisterOptions): () => void {
    const std = STANDARD[name as StandardAction] as (typeof STANDARD)[StandardAction] | undefined;
    const decl: HostCapabilityDeclaration = {
      name,
      label: opts.label ?? std?.label ?? name,
      ...((opts.description ?? std?.description)
        ? { description: (opts.description ?? std?.description) as string }
        : {}),
      ...(opts.args !== undefined || std !== undefined
        ? {
            args: opts.args ?? {
              type: 'object',
              properties: { [std?.arg as string]: { type: 'string', maxLength: ARG_MAX } },
              required: [std?.arg],
            },
          }
        : {}),
      ...(opts.unprompted === true ? { unprompted: true } : {}),
      equivalent: opts.equivalent,
    };
    this.entries.set(name, {
      decl,
      handler: handler as Entry['handler'],
      argName: std?.arg ?? null,
    });
    return () => {
      this.entries.delete(name);
    };
  }

  public declarations(): readonly HostCapabilityDeclaration[] {
    return [...this.entries.values()].map((e) => e.decl);
  }

  /** The surface to hand `core.setSurface`. */
  public surface(state?: HostSurfaceState, kind = 'world'): HostSurface {
    return { kind, capabilities: this.declarations(), ...(state === undefined ? {} : { state }) };
  }

  public has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Run a handler, with every failure mode folded into a report. Never throws. */
  public async invoke(
    name: string,
    args: Readonly<Record<string, unknown>>,
    unprompted: boolean,
  ): Promise<ActionReport> {
    const e = this.entries.get(name);
    if (e === undefined) {
      return { status: 'failed', refused: true, text: null };
    }
    const fail = (refused: boolean): ActionReport => {
      this.announce(equivalentText(e.decl.equivalent));
      return { status: 'failed', refused, text: equivalentText(e.decl.equivalent) };
    };
    if (e.argName !== null) {
      const v = args[e.argName];
      if (typeof v !== 'string' || v === '' || v.length > ARG_MAX) {
        return fail(false);
      }
    }
    try {
      const out = await e.handler(args, { equivalent: e.decl.equivalent, unprompted });
      const ok = out === undefined || out === true || (typeof out === 'object' && out.ok);
      if (!ok) {
        return fail(true);
      }
      return {
        status: 'done',
        refused: false,
        text: typeof out === 'object' ? (out.text ?? null) : null,
      };
    } catch {
      return fail(true);
    }
  }

  /** Route a bot-fired invocation to its handler and answer it into the thread. */
  public bind(conversation: ConversationLike): () => void {
    return conversation.onCapability((inv: HostCapabilityInvocation) => {
      /*
       * The operator's switch, as a second wall. The core already drops a
       * bot-fired capability when the space turned them off
       * (`Conversation.setUnpromptedAllowed`); this keeps a stand-in
       * conversation, or a core older than the switch, from running a
       * handler for one. Read structurally because `ConversationLike` is a
       * fixed pick of the core class.
       */
      if ((conversation as { acceptsUnprompted?: boolean }).acceptsUnprompted === false) {
        return;
      }
      void this.invoke(inv.capability, inv.args, true)
        .then((r) =>
          conversation.reportAction({
            messageId: inv.messageId,
            actionId: inv.invocationId,
            status: r.status,
            ...(r.text === null ? {} : { text: r.text }),
            ...(r.refused ? { data: { refused: true } } : {}),
          }),
        )
        // Reporting is best-effort: the visitor already saw the announcement.
        .catch(() => undefined);
    });
  }
}
