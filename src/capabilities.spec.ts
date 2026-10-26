import { describe, expect, it, vi } from 'vitest';

import { CapabilityRegistry } from './capabilities.js';
import { fakeConversation, flush } from './test/fake.js';

const eq = { kind: 'text', text: 'The shop is on level 2, next to the lifts.' } as const;

describe('CapabilityRegistry', () => {
  it('declares the standard intents with the bot-facing label, args and the REQUIRED equivalent', () => {
    const reg = new CapabilityRegistry();
    reg.register('world.walk_to', () => undefined, { equivalent: eq, unprompted: true });
    reg.register('avatar.try_on', () => undefined, {
      equivalent: { kind: 'url', href: 'https://x.test/sizes' },
    });
    const [walk, tryOn] = reg.declarations();
    expect(walk).toMatchObject({
      name: 'world.walk_to',
      label: 'Take me there',
      unprompted: true,
      equivalent: eq,
    });
    expect(walk?.args).toMatchObject({ required: ['place'] });
    expect(tryOn?.unprompted).toBeUndefined();
    expect(reg.surface({ room: 'atrium' })).toMatchObject({
      kind: 'world',
      state: { room: 'atrium' },
    });
  });

  it('routes a bot-fired invocation to the handler and reports it done', async () => {
    const f = fakeConversation();
    const reg = new CapabilityRegistry();
    const handler = vi.fn(() => ({ ok: true, text: 'Arrived' }));
    reg.register('world.walk_to', handler, { equivalent: eq });
    reg.bind(f.conv);
    f.fire({ capability: 'world.walk_to', args: { place: 'shop' } });
    await flush();
    expect(handler).toHaveBeenCalledWith({ place: 'shop' }, { equivalent: eq, unprompted: true });
    expect(f.calls.reports).toEqual([
      { messageId: 'm-9', actionId: 'inv-1', status: 'done', text: 'Arrived' },
    ]);
  });

  it('never runs a handler for a bot-fired invocation when the space turned them off', async () => {
    const f = fakeConversation();
    const reg = new CapabilityRegistry();
    const handler = vi.fn(() => ({ ok: true }));
    reg.register('world.walk_to', handler, { equivalent: eq });
    // The core's `Conversation.acceptsUnprompted`, structurally.
    reg.bind(Object.assign(f.conv, { acceptsUnprompted: false }));
    f.fire({ capability: 'world.walk_to', args: { place: 'shop' } });
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(f.calls.reports).toEqual([]);
  });

  it('CONTROL: acceptsUnprompted left true runs it', async () => {
    const f = fakeConversation();
    const reg = new CapabilityRegistry();
    const handler = vi.fn(() => ({ ok: true }));
    reg.register('world.walk_to', handler, { equivalent: eq });
    reg.bind(Object.assign(f.conv, { acceptsUnprompted: true }));
    f.fire({ capability: 'world.walk_to', args: { place: 'shop' } });
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a refusal is reported failed+refused and announces the non-spatial equivalent', async () => {
    const f = fakeConversation();
    const said: string[] = [];
    const reg = new CapabilityRegistry((t) => said.push(t));
    reg.register('scene.highlight', () => false, { equivalent: eq });
    reg.bind(f.conv);
    f.fire({ capability: 'scene.highlight', args: { ref: 'dunk-low' } });
    await flush();
    expect(f.calls.reports[0]).toMatchObject({
      status: 'failed',
      data: { refused: true },
      text: eq.text,
    });
    expect(said).toEqual([eq.text]);
  });

  it('an unregistered capability and a throwing handler both fail, never crash', async () => {
    const f = fakeConversation();
    const said: string[] = [];
    const reg = new CapabilityRegistry((t) => said.push(t));
    reg.register(
      'scene.spawn',
      () => {
        throw new Error('boom');
      },
      { equivalent: eq },
    );
    reg.bind(f.conv);
    f.fire({ capability: 'nope.nothing' });
    f.fire({ capability: 'scene.spawn', args: { ref: 'dunk' }, invocationId: 'inv-2' });
    await flush();
    expect(f.calls.reports.map((r) => r['status'])).toEqual(['failed', 'failed']);
    expect(said).toEqual([eq.text]);
  });

  it('checks args before a handler sees them', async () => {
    const reg = new CapabilityRegistry();
    const handler = vi.fn();
    reg.register('world.walk_to', handler, { equivalent: eq });
    for (const args of [{}, { place: '' }, { place: 7 }, { place: 'x'.repeat(41) }]) {
      expect((await reg.invoke('world.walk_to', args, true)).status).toBe('failed');
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('unregister removes the declaration', () => {
    const reg = new CapabilityRegistry();
    const off = reg.register('world.walk_to', () => undefined, { equivalent: eq });
    off();
    expect(reg.declarations()).toEqual([]);
  });
});
