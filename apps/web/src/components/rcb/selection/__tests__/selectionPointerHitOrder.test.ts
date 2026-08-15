/**
 * ADR 0027 pointer pipeline: overlay → geometry chrome → (no soft-pad interior).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { pickSelectionInkAtClient } from '../SelectionChrome';

describe('selection pointer hit order', () => {
  let stack: Element[];

  beforeEach(() => {
    stack = [];
    document.elementsFromPoint = () => stack;
  });

  afterEach(() => {
    stack = [];
  });

  it('prefers overlay seat over geometry chrome at the same client point', () => {
    const radius = document.createElement('div');
    radius.setAttribute('data-radius-handle', 'tl');
    stack = [radius];
    const ink = pickSelectionInkAtClient(0, 0, radius, {
      showHandles: true,
      showRotate: true,
      box: { left: 0, top: 0, width: 100, height: 100 },
      zoom: 1,
      scene: { x: 0, y: 0 },
    });
    expect(ink).toEqual(
      expect.objectContaining({
        layer: 'overlay',
        pick: expect.objectContaining({ kind: 'radius' }),
      })
    );
  });

  it('uses geometry chrome when overlay stack is empty', () => {
    stack = [];
    const ink = pickSelectionInkAtClient(100, 0, null, {
      showHandles: true,
      showRotate: true,
      box: { left: 0, top: 0, width: 100, height: 80 },
      zoom: 2,
      scene: { x: 100, y: 0 },
    });
    expect(ink).toEqual(
      expect.objectContaining({
        layer: 'chrome',
        pick: expect.objectContaining({ kind: 'resize', handle: 'ne' }),
      })
    );
  });
});
