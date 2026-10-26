/**
 * `worldTheme` tokens -> three.js materials and shapes. Every token a
 * renderer needs comes through here, so a default renderer and a host's own
 * override read the same look from one place.
 */
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from 'three';

import type { ResolvedWorldTheme } from '@chatlychat/core';

type Surface = MeshStandardMaterial | MeshPhysicalMaterial;

/** The panel's fill, or null for `panelMaterial: 'none'` (text floats on nothing). */
export function panelSurface(
  theme: ResolvedWorldTheme,
  color: string = theme.panelColor,
): Surface | null {
  if (theme.panelMaterial === 'none') {
    return null;
  }
  const common = {
    color,
    emissive: color,
    emissiveIntensity: theme.panelEmissive,
    side: DoubleSide,
  };
  if (theme.panelMaterial === 'glass') {
    return new MeshPhysicalMaterial({
      ...common,
      transparent: true,
      opacity: theme.panelOpacity,
      transmission: 0.6,
      roughness: 0.15,
    });
  }
  return new MeshStandardMaterial({
    ...common,
    transparent: theme.panelMaterial !== 'solid' && theme.panelOpacity < 1,
    opacity: theme.panelMaterial === 'solid' ? 1 : theme.panelOpacity,
    roughness: theme.panelMaterial === 'matte' ? 1 : 0.4,
  });
}

/** A rounded rectangle centred on the origin, in the xy plane. */
export function roundedRect(width: number, height: number, radius: number): ShapeGeometry {
  const r = Math.min(radius, width / 2, height / 2);
  const x = -width / 2;
  const y = -height / 2;
  const s = new Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new ShapeGeometry(s);
}

/** The panel's backing plate, or null when the material is `none`. */
export function panelBacking(
  theme: ResolvedWorldTheme,
  width: number,
  height: number,
): Mesh | null {
  const mat = panelSurface(theme);
  if (mat === null) {
    return null;
  }
  const mesh = new Mesh(roundedRect(width, height, theme.panelRadiusMetres), mat);
  mesh.name = 'cl3-panel-backing';
  return mesh;
}

/** A speech bubble's plate: `none` has no plate, `square` has no radius, `cloud` is extra round. */
export function bubbleBacking(
  theme: ResolvedWorldTheme,
  width: number,
  height: number,
): Mesh | null {
  const shape = theme.bubbleShape;
  if (shape === 'none') {
    return null;
  }
  const mat = new MeshStandardMaterial({
    color: theme.bubbleColor,
    emissive: theme.bubbleColor,
    emissiveIntensity: theme.panelEmissive,
    side: DoubleSide,
  });
  const geometry =
    shape === 'square'
      ? new PlaneGeometry(width, height)
      : roundedRect(
          width,
          height,
          shape === 'cloud' ? height / 2 : Math.max(theme.panelRadiusMetres, 0.03),
        );
  const mesh = new Mesh(geometry, mat);
  mesh.userData['shape'] = shape;
  return mesh;
}

export function accentMaterial(theme: ResolvedWorldTheme, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: theme.accentColor,
    transparent: opacity < 1,
    opacity,
    side: DoubleSide,
  });
}
