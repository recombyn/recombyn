/**
 * Hit-pad placement under the camera world layer (same as smart guides):
 * left/top = scene; size = screenPx / cssZoom.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  placeHitPadAtScene,
  RCB_HIT_SCENE_X_ATTR,
  RCB_HIT_SCENE_Y_ATTR,
  RCB_HIT_SIZE_ATTR,
} from '../SelectionChrome';
import { rcbCameraCssZoom } from '@/components/rcb/core/math';

describe('placeHitPadAtScene (world scene space)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sets left/top to scene coords — pan comes from world CSS translate', () => {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const pad = document.createElement('div');
    layer.appendChild(pad);

    const camera = { x: 12.3, y: -40.7, zoom: 2.5 };
    expect(placeHitPadAtScene(pad, 100, 80, 16, camera, layer, 1)).toBe(true);

    // Must NOT bake cam into left/top (that was the overlay mistake).
    expect(pad.style.left).toBe('100px');
    expect(pad.style.top).toBe('80px');
    expect(pad.style.transform).toBe('translate(-50%, -50%)');
    expect(pad.getAttribute(RCB_HIT_SCENE_X_ATTR)).toBe('100');
    expect(pad.getAttribute(RCB_HIT_SCENE_Y_ATTR)).toBe('80');
    expect(pad.getAttribute(RCB_HIT_SIZE_ATTR)).toBe('16');
  });

  it('sizes in scene units so world scale(zoom) yields screenPx', () => {
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const pad = document.createElement('div');
    layer.appendChild(pad);

    const camera = { x: -5000, y: -3000, zoom: 100 };
    const z = rcbCameraCssZoom(camera);
    expect(placeHitPadAtScene(pad, 52.5, 41.25, 8, camera, layer, 1)).toBe(true);

    expect(pad.style.left).toBe('52.5px');
    expect(pad.style.top).toBe('41.25px');
    const w = Number(pad.style.width.replace('px', ''));
    expect(w * z).toBeCloseTo(8, 5);
  });
});
