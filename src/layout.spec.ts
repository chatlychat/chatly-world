import { describe, expect, it } from 'vitest';

import { layoutCards } from './layout.js';

const facing = (p: { position: readonly [number, number, number]; yaw: number }): number => {
  // dot(card front, direction card -> origin), both horizontal and unit.
  const [x, , z] = p.position;
  const len = Math.hypot(x, z);
  return (Math.sin(p.yaw) * -x + Math.cos(p.yaw) * -z) / len;
};

describe('layoutCards', () => {
  it('arc: equidistant, symmetric, every card faces the viewer', () => {
    const { poses, mount } = layoutCards('arc', 5, 0.35);
    expect(mount).toBe('stand');
    const radii = poses.map((p) => Math.hypot(p.position[0], p.position[2]));
    for (const r of radii) {
      expect(r).toBeCloseTo(1.2, 6);
    }
    expect(poses[0]?.position[0]).toBeCloseTo(-(poses[4]?.position[0] ?? 0), 6);
    expect(poses[2]?.position[0]).toBeCloseTo(0, 6);
    for (const p of poses) {
      expect(facing(p)).toBeCloseTo(1, 6);
    }
  });

  it('arc: widens the circle instead of wrapping past 160 degrees, keeping spacing', () => {
    const { poses } = layoutCards('arc', 24, 0.35);
    const r = Math.hypot(poses[0]?.position[0] ?? 0, poses[0]?.position[2] ?? 0);
    expect(r).toBeGreaterThan(1.2);
    const first = poses[0]?.position ?? [0, 0, 0];
    const last = poses[23]?.position ?? [0, 0, 0];
    const half = Math.atan2(Math.abs(last[0] - first[0]) / 2, Math.abs((first[2] + last[2]) / 2));
    expect(half).toBeLessThanOrEqual((80 * Math.PI) / 180 + 1e-6);
  });

  it('shelf: four to a row, rows stack upward, facing the viewer', () => {
    const { poses, mount } = layoutCards('shelf', 6, 0.35);
    expect(mount).toBe('stand');
    expect(poses.slice(0, 4).every((p) => p.position[1] === 0)).toBe(true);
    expect(poses[4]?.position[1]).toBeCloseTo(0.4, 6);
    // The short second row is centred on its own two cards.
    expect((poses[4]?.position[0] ?? 0) + (poses[5]?.position[0] ?? 0)).toBeCloseTo(0, 6);
    expect(poses.every((p) => p.yaw === 0 && p.pitch === 0)).toBe(true);
  });

  it('wall: five wide, reads top-left to bottom-right, hung', () => {
    const { poses, mount } = layoutCards('wall', 7, 0.35);
    expect(mount).toBe('hang');
    expect(poses[0]?.position[1]).toBeGreaterThan(poses[5]?.position[1] ?? 0);
    expect(poses[0]?.position[0]).toBeLessThan(poses[1]?.position[0] ?? 0);
  });

  it('table: laid flat below eye height', () => {
    const { poses, mount } = layoutCards('table', 4, 0.35);
    expect(mount).toBe('lay');
    for (const p of poses) {
      expect(p.pitch).toBeCloseTo(-Math.PI / 2, 6);
      expect(p.position[1]).toBeLessThan(0);
    }
  });

  it('zero cards is empty, never an error', () => {
    for (const k of ['arc', 'shelf', 'wall', 'table'] as const) {
      expect(layoutCards(k, 0, 0.35).poses).toEqual([]);
    }
  });
});
