import { BoxGeometry, Box3, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { bubbleScale } from './bubble.js';
import { formatPrice } from './cards.js';
import { anchorOffset, fitModel } from './model.js';
import { DEAD_METRES, DEAD_YAW, lazyStep, wrapAngle } from './panel.js';
import { msg } from './test/fake.js';
import { wrapText } from './text.js';
import { readVisemes, visemeAt } from './visemes.js';

describe('anchorOffset', () => {
  const box = new Box3().setFromObject(new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial()));
  it.each([
    ['center', [0, 0, 0]],
    ['base', [0, 2, 0]],
    ['top', [0, -2, 0]],
    ['back', [0, 0, 3]],
  ] as const)('%s moves that point of the model to the origin', (anchor, want) => {
    const o = anchorOffset(box, anchor);
    expect([o.x, o.y, o.z].map((n) => Math.round(n * 1e6) / 1e6 + 0)).toEqual(want);
  });

  it('scale multiplies the file size BEFORE the anchor is taken', () => {
    const fitted = fitModel(
      new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial()),
      0.5,
      'base',
    );
    const b = new Box3().setFromObject(fitted);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.y).toBeCloseTo(2, 6);
  });
});

describe('visemes', () => {
  it('reads one tolerant shape and drops everything else', () => {
    expect(readVisemes(msg({ id: 'a' }))).toBeNull();
    expect(readVisemes(msg({ id: 'a', metadata: { visemes: 'aa' } }))).toBeNull();
    const track = readVisemes(
      msg({
        id: 'a',
        metadata: {
          visemes: [
            { t: 200, v: 'oh' },
            { t: 0, v: 'aa', w: 0.5 },
            { t: -1, v: 'x' },
            { v: 'y' },
            null,
          ],
        },
      }),
    );
    expect(track).toEqual([
      { t: 0, v: 'aa', w: 0.5 },
      { t: 200, v: 'oh', w: 1 },
    ]);
  });

  it('holds a viseme until the next, and lets the last one go', () => {
    const t = [
      { t: 0, v: 'aa', w: 1 },
      { t: 200, v: 'oh', w: 1 },
    ];
    expect(visemeAt(t, 100)?.v).toBe('aa');
    expect(visemeAt(t, 200)?.v).toBe('oh');
    expect(visemeAt(t, 600)).toBeNull();
  });
});

describe('lazyStep', () => {
  const home = { x: 0, y: 1.5, z: -1, yaw: 0, chasing: false };

  it('stays put inside the dead zone', () => {
    const want = { x: 0.2, y: 1.5, z: -1, yaw: DEAD_YAW * 0.5 };
    expect(lazyStep(home, want, 16, false)).toBe(home);
  });

  it('chases once the viewer leaves it, and keeps chasing until it has arrived', () => {
    const want = { x: DEAD_METRES * 2, y: 1.5, z: -1, yaw: 0 };
    let s = lazyStep(home, want, 16, false);
    expect(s.chasing).toBe(true);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(want.x);
    for (let i = 0; i < 200; i += 1) {
      s = lazyStep(s, want, 16, false);
    }
    expect(s.chasing).toBe(false);
    expect(s.x).toBeCloseTo(want.x, 1);
  });

  it('turns the short way round', () => {
    const s = lazyStep(
      { ...home, yaw: Math.PI - 0.1 },
      { x: 0, y: 1.5, z: -1, yaw: -Math.PI + 1 },
      16,
      false,
    );
    // 1.1 rad across the seam, not 5.2 the long way: the step goes the positive way.
    expect(wrapAngle(s.yaw - (Math.PI - 0.1))).toBeGreaterThan(0);
  });

  it('with reduced motion, snaps instead of gliding', () => {
    const want = { x: 3, y: 1.5, z: -1, yaw: 1 };
    expect(lazyStep(home, want, 16, true)).toEqual({ ...want, chasing: false });
  });
});

describe('small pieces', () => {
  it('bubbleScale grows with distance and is clamped both ways', () => {
    expect(bubbleScale(0.1)).toBe(0.6);
    expect(bubbleScale(2)).toBe(1);
    expect(bubbleScale(3)).toBeGreaterThan(bubbleScale(2));
    expect(bubbleScale(1000)).toBe(2.5);
  });

  it('wraps on words and never loses a long word', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrapText('abcdefghijkl', 5)).toEqual(['abcd…']);
    expect(wrapText('a\nb', 5)).toEqual(['a', 'b']);
  });

  it('formats minor units by the currency, not by 100', () => {
    expect(formatPrice(10900, 'GBP', 'en-GB')).toBe('£109.00');
    expect(formatPrice(5000, 'JPY', 'en-US')).toBe('¥5,000');
  });
});
