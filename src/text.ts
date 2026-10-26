/**
 * Text on a plane, styled by the resolved `worldTheme`.
 *
 * Text is drawn to a canvas texture when a canvas exists. Without one (a
 * Node test, a worker) the mesh is still built — same geometry, same
 * material, `userData.text` set — just with no map, which is what lets the
 * scene-graph specs run with no GL and no DOM.
 *
 * Layout is measured by a fixed advance (half an em per character) rather
 * than by the canvas, so a plane's size is the same in a browser and in a
 * test, and wrapping never depends on which font happened to load.
 */
import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

import type { ResolvedWorldTheme } from '@chatlychat/core';

/** Metres of cap-height-ish type at textScale 1: legible at arm's length. */
export const BASE_FONT_METRES = 0.035;
const ADVANCE = 0.5;
const LINE_HEIGHT = 1.3;
const MAX_CANVAS_PX = 2048;
const FONT_FAMILY = 'cl3-font, system-ui, sans-serif';

export interface TextOptions {
  readonly maxWidthMetres: number;
  /** Multiplier on `BASE_FONT_METRES`, on top of the theme's `textScale`. */
  readonly size?: number;
  readonly color?: string;
}

export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
      if (line !== '' && line.length + 1 + w.length > maxChars) {
        lines.push(line);
        line = w;
      } else {
        line = line === '' ? w : `${line} ${w}`;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Load the theme's font once; text drawn before it arrives uses the fallback. */
const loadedFonts = new Set<string>();
export function ensureFont(url: string | null): void {
  const g = globalThis as {
    FontFace?: new (n: string, s: string) => { load(): Promise<unknown> };
    document?: { fonts?: { add(f: unknown): void } };
  };
  if (
    url === null ||
    loadedFonts.has(url) ||
    g.FontFace === undefined ||
    g.document?.fonts === undefined
  ) {
    return;
  }
  loadedFonts.add(url);
  const face = new g.FontFace('cl3-font', `url(${JSON.stringify(url)})`);
  face.load().then(
    () => g.document?.fonts?.add(face),
    () => loadedFonts.delete(url),
  );
}

export function createTextMesh(text: string, theme: ResolvedWorldTheme, opts: TextOptions): Mesh {
  const font = BASE_FONT_METRES * theme.textScale * (opts.size ?? 1);
  const maxChars = Math.max(4, Math.floor(opts.maxWidthMetres / (font * ADVANCE)));
  const lines = wrapText(text, maxChars);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const width = Math.min(opts.maxWidthMetres, longest * font * ADVANCE + font);
  const height = lines.length * font * LINE_HEIGHT + font * 0.4;
  const color = opts.color ?? theme.textColor;

  const material = new MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#ffffff',
    emissiveIntensity: theme.textEmissive,
    transparent: true,
    roughness: 1,
    metalness: 0,
  });
  const mesh = new Mesh(new PlaneGeometry(width, height), material);
  mesh.userData['text'] = text;
  mesh.userData['lines'] = lines;
  mesh.userData['size'] = [width, height];

  const canvas = (
    globalThis as { document?: { createElement(t: string): HTMLCanvasElement } }
  ).document?.createElement('canvas');
  const ctx = canvas?.getContext('2d') ?? null;
  if (canvas !== undefined && ctx !== null) {
    const pxPerMetre = Math.min(1200, MAX_CANVAS_PX / width);
    canvas.width = Math.ceil(width * pxPerMetre);
    canvas.height = Math.ceil(height * pxPerMetre);
    const fontPx = font * pxPerMetre;
    ctx.font = `${String(theme.fontWeight)} ${String(fontPx)}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
      const y = fontPx * 0.2 + i * fontPx * LINE_HEIGHT;
      if (theme.textOutlineWidth > 0) {
        ctx.strokeStyle = theme.textOutlineColor;
        ctx.lineWidth = theme.textOutlineWidth * pxPerMetre * 2;
        ctx.strokeText(l, fontPx / 2, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(l, fontPx / 2, y);
    });
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    material.map = map;
    material.emissiveMap = map;
    material.needsUpdate = true;
  }
  return mesh;
}
