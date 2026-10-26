/**
 * Viseme-driven mouth — optional input only.
 *
 * Voice is built in a parallel lane and its message fields are not final, so
 * this reads ONE tolerant shape off `message.metadata.visemes`:
 * `[{ t: <ms from the start of the utterance>, v: <viseme name>, w?: 0..1 }]`.
 * Anything else — absent, malformed, unsorted garbage — is null, and a null
 * track means the mouth is simply not driven. A mouth is ornament; the body of
 * the message is the message.
 */
import type { ConversationMessage } from '@chatlychat/core';

export interface Viseme {
  readonly t: number;
  readonly v: string;
  readonly w: number;
}

export type VisemeTrack = readonly Viseme[];

export function readVisemes(message: ConversationMessage): VisemeTrack | null {
  const raw = message.metadata['visemes'];
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: Viseme[] = [];
  for (const e of raw as unknown[]) {
    const r = (typeof e === 'object' && e !== null ? e : {}) as Record<string, unknown>;
    const { t, v, w } = r;
    if (
      typeof t !== 'number' ||
      !Number.isFinite(t) ||
      t < 0 ||
      typeof v !== 'string' ||
      v === ''
    ) {
      continue;
    }
    out.push({ t, v, w: typeof w === 'number' && w >= 0 && w <= 1 ? w : 1 });
  }
  return out.length === 0 ? null : out.sort((a, b) => a.t - b.t);
}

/** The viseme held at `tMs`, or null before the first and after the last has been held 250ms. */
export function visemeAt(track: VisemeTrack, tMs: number): Viseme | null {
  let held: Viseme | null = null;
  for (const e of track) {
    if (e.t > tMs) {
      break;
    }
    held = e;
  }
  const last = track[track.length - 1];
  return held === null || (held === last && tMs - held.t > 250) ? null : held;
}

/**
 * Morph-target names to try for a viseme, in order. Covers the Oculus/ARKit
 * `viseme_*` set and VRM's five vowels, because a VRM avatar is a glTF the
 * loader can read and drive by morph target even though its bones are not
 * ours to animate.
 */
export function morphNamesFor(v: string): readonly string[] {
  return [v, `viseme_${v}`, `Viseme_${v}`];
}
