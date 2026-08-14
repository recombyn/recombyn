import { describe, expect, it } from 'vitest';
import {
  matchAspectPresetKey,
  pointInOrientedBox,
  resizeFromHandle,
  resolveControlChrome,
  unionOfBoxes,
} from '../resizeGeometry';
import { resolveOutlinePathD } from '../HostPathChrome';
import type { SceneDocument } from '@/components/rcb/sceneNode';

const PRESETS = [
  { id: 'original', w: 0, h: 0 },
  { id: '1:1', w: 1, h: 1 },
  { id: '16:9', w: 16, h: 9 },
];

describe('resizeFromHandle', () => {
  it('can shrink below the old 8px floor down to 1px', () => {
    const union = { left: 0, top: 0, width: 40, height: 40 };
    const next = resizeFromHandle(union, 'se', -39, -39, 0);
    expect(next.width).toBe(1);
    expect(next.height).toBe(1);
    // Old floor would have clamped here at 8.
    const mid = resizeFromHandle(union, 'se', -35, -35, 0);
    expect(mid.width).toBe(5);
    expect(mid.height).toBe(5);
  });
});

describe('matchAspectPresetKey', () => {
  it('matches true 1:1', () => {
    expect(matchAspectPresetKey(400, 400, PRESETS)).toBe('1:1');
  });

  it('does not label near-square chrome as 1:1', () => {
    expect(matchAspectPresetKey(449, 457, PRESETS)).toBe('original');
  });

  it('matches 16:9 within slack', () => {
    expect(matchAspectPresetKey(1600, 900, PRESETS)).toBe('16:9');
  });
});

describe('resolveControlChrome', () => {
  it('uses single member box and angle', () => {
    const doc = {
      deltaSetLike: {
        a: { attrs: { angle: 30 } },
      },
    } as unknown as SceneDocument;
    const { box, angle } = resolveControlChrome(doc, [
      { nodeId: 'a', box: { left: 10, top: 20, width: 40, height: 50 } },
    ]);
    expect(box).toEqual({ left: 10, top: 20, width: 40, height: 50 });
    expect(angle).toBe(30);
  });

  it('unions axis boxes when angles match at 0', () => {
    const doc = {
      deltaSetLike: {
        a: { attrs: { angle: 0 } },
        b: { attrs: { angle: 0 } },
      },
    } as unknown as SceneDocument;
    const { box, angle } = resolveControlChrome(doc, [
      { nodeId: 'a', box: { left: 0, top: 0, width: 10, height: 10 } },
      { nodeId: 'b', box: { left: 20, top: 0, width: 10, height: 10 } },
    ]);
    expect(angle).toBe(0);
    expect(box).toEqual(
      unionOfBoxes([
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 20, top: 0, width: 10, height: 10 },
      ])
    );
  });
});

describe('pointInOrientedBox', () => {
  it('hits center of rotated box', () => {
    const box = { left: 0, top: 0, width: 100, height: 40 };
    expect(pointInOrientedBox({ x: 50, y: 20 }, box, 0)).toBe(true);
    expect(pointInOrientedBox({ x: 200, y: 20 }, box, 0)).toBe(false);
  });
});

describe('resolveOutlinePathD', () => {
  it('prefers painted path for vector strokes', () => {
    const node = {
      key: 'shape',
      attrs: { shapeType: 'pencil', path: 'M 0 0 L 10 10' },
    };
    expect(resolveOutlinePathD(node, 100, 80)).toBe('M 0 0 L 10 10');
  });

  it('uses geometry indicator for plain rect', () => {
    const node = {
      key: 'shape',
      attrs: { shapeType: 'rect' },
    };
    const d = resolveOutlinePathD(node, 40, 20);
    expect(d.length).toBeGreaterThan(4);
    expect(d.startsWith('M')).toBe(true);
  });
});
