import { describe, expect, it } from 'vitest';
import {
  buildOutlinePath,
  type OutlineBuildOpts,
} from '../outlineToPath';
import { polylinePathD } from '@/components/rcb/tools/pencilBrushes';

function countLinearVerts(d: string): number {
  return (String(d).match(/[ML]/gi) || []).length;
}

function thickPencilNode(pointCount: number) {
  const pts = Array.from({ length: pointCount }, (_, i) => ({
    x: i * 1.2,
    y: Math.sin(i * 0.35) * 18 + Math.sin(i * 0.11) * 9 + 40,
  }));
  return {
    key: 'shape',
    width: pointCount * 1.2 + 40,
    height: 120,
    attrs: {
      shapeType: 'pencil',
      path: polylinePathD(pts),
      stroke: '#111',
      strokeWidth: 28,
      borderWidth: 28,
      brushStyle: 'vector-ink',
    },
  };
}

describe('outline sparsify by zoom', () => {
  it('keeps fewer edit verts when zoomed out than zoomed in', () => {
    const node = thickPencilNode(160);
    const far = buildOutlinePath(node, { zoom: 0.3 } satisfies OutlineBuildOpts);
    const near = buildOutlinePath(node, { zoom: 4 } satisfies OutlineBuildOpts);
    expect(far?.pathD).toBeTruthy();
    expect(near?.pathD).toBeTruthy();
    expect(far!.pathD.toLowerCase()).not.toContain('q');
    expect(near!.pathD.toLowerCase()).not.toContain('q');
    const farN = countLinearVerts(far!.pathD);
    const nearN = countLinearVerts(near!.pathD);
    expect(farN).toBeLessThan(nearN);
    expect(farN).toBeLessThan(90);
  });

  it('does not keep one vertex per capture sample on thick pencil', () => {
    const node = thickPencilNode(200);
    const out = buildOutlinePath(node, { zoom: 1 });
    expect(out?.pathD).toBeTruthy();
    expect(countLinearVerts(out!.pathD)).toBeLessThan(120);
    expect(out!.pathD.toLowerCase()).not.toContain('q');
  });
});
