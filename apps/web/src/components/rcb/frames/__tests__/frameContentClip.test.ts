import { describe, expect, it } from 'vitest';
import { applyFrameContentClip } from '../frameContentClip';

describe('frame content clipping', () => {
  it('unwraps a node immediately after it leaves the clipping frame', () => {
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    root.append(layer);
    layer.append(node);

    const frame = {
      id: 'frame-1',
      name: 'Frame',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      clipContent: true,
      hidden: false,
      backgroundColor: '#fff',
    };

    applyFrameContentClip(root, node, { frames: [frame] }, {
      x: 120,
      y: 120,
      width: 40,
      height: 40,
      attrs: { frameId: 'frame-1' },
    });
    expect(node.parentElement?.getAttribute('data-frame-clip-wrap')).toBe('1');

    applyFrameContentClip(root, node, { frames: [frame] }, {
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      attrs: { frameId: 'frame-1' },
    });

    expect(node.parentElement).toBe(layer);
    expect(node.hasAttribute('clip-path')).toBe(false);
    expect(root.querySelector('[data-frame-clip-wrap="1"]')).toBeNull();
  });
});
