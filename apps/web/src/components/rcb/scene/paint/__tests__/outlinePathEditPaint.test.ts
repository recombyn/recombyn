import { describe, expect, it } from 'vitest';
import { buildOutlinePath, outlineNodePatch } from '../outlineToPath';
import { penSubpathsFromD } from '@/components/rcb/tools/penPath';
import { polylinePathD } from '@/components/rcb/tools/pencilBrushes';
import { filterAnchorsForKnobPaint } from '@/components/rcb/tools/PenPathEditFeature';

function scribble(n = 40) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return {
      x: 40 + t * 220 + Math.sin(t * 14) * 28,
      y: 90 + Math.sin(t * 7) * 48,
    };
  });
}

describe('pen/pencil outline → path-edit paint', () => {
  it('keeps fill ink and closed ribbon after outlineNodePatch', () => {
    const sw = 16;
    const node = {
      key: 'shape' as const,
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      attrs: {
        shapeType: 'pencil',
        path: polylinePathD(scribble()),
        'border-color': '#112233',
        'border-width': sw,
        borderWidth: sw,
        brushStyle: 'solid',
      },
    };
    const out = buildOutlinePath(node, { zoom: 1 });
    expect(out?.pathD).toBeTruthy();
    expect(out?.closed).toBe(true);
    expect(out?.fillColor).toBe('#112233');
    const patch = outlineNodePatch(node, out!);
    expect(patch.attrs.shapeType).toBe('path');
    expect(patch.attrs['fill-color']).toBe('#112233');
    expect(patch.attrs['fill-enabled']).toBe('true');
    expect(String(patch.attrs['stroke-enabled'])).toBe('false');
    expect(Number(patch.attrs['border-width'])).toBe(sw);
    expect(String(patch.attrs.closed)).toBe('true');
    const subs = penSubpathsFromD(String(patch.attrs.path));
    expect(subs.some((s) => s.closed)).toBe(true);
    expect(subs[0].anchors.length).toBeGreaterThan(4);
    // Path-edit must treat this as fill ink — not an open hairline centerline.
    const anyClosed = subs.some((s) => s.closed);
    const fillEnabled =
      patch.attrs['fill-enabled'] !== false &&
      patch.attrs['fill-enabled'] !== 'false' &&
      patch.attrs['fill-color'] &&
      patch.attrs['fill-color'] !== 'transparent';
    expect(anyClosed && fillEnabled).toBeTruthy();
  });

  it('does not force-paint every handle-bearing outline vert', () => {
    const out = buildOutlinePath(
      {
        key: 'shape',
        width: 300,
        height: 200,
        attrs: {
          shapeType: 'pencil',
          path: polylinePathD(scribble(80)),
          'border-width': 16,
          brushStyle: 'solid',
        },
      },
      { zoom: 1 }
    );
    const anchors = penSubpathsFromD(out!.pathD)[0].anchors;
    const withForceHandles = filterAnchorsForKnobPaint(
      anchors.map((a) => ({
        x: a.x,
        y: a.y,
        force: a.outX != null || a.inX != null,
      })),
      1
    ).filter(Boolean).length;
    const withoutForce = filterAnchorsForKnobPaint(
      anchors.map((a) => ({ x: a.x, y: a.y })),
      1
    ).filter(Boolean).length;
    // Forcing every Q→C handle anchor carpets the canvas.
    expect(withForceHandles).toBeGreaterThan(withoutForce);
    expect(withoutForce).toBeLessThanOrEqual(48);
  });
});
