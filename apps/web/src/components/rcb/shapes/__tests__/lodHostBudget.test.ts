import { describe, expect, it } from 'vitest';
import { canIdlePaintOnCanvas, lodProxyIsStrokeOnly, pickFullAndProxyIds } from '../RcbShapesLayer';
import { HEAVY_PATH_D_CHARS } from '@/components/rcb/scene/document/sceneShapes';
import type { SceneDocument } from '@/components/rcb/sceneNode';

function makeDoc(nodes: Record<string, any>): SceneDocument {
  const children = Object.keys(nodes);
  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    deltaSetLike: {
      ROOT: { id: 'ROOT', key: 'entry', x: 0, y: 0, width: 0, height: 0, attrs: {}, children },
      ...nodes,
    },
  } as SceneDocument;
}

function rect(id: string, w = 40, h = 40) {
  return {
    id,
    key: 'shape',
    x: 0,
    y: 0,
    width: w,
    height: h,
    attrs: { shapeType: 'rect', 'fill-color': '#abc', 'stroke-enabled': false },
  };
}

function textNode(id: string) {
  return {
    id,
    key: 'text',
    x: 0,
    y: 0,
    width: 80,
    height: 24,
    attrs: {
      fontSize: 14,
      ORIGIN_DATA: JSON.stringify([{ children: [{ text: 'Hi' }] }]),
    },
  };
}

function imageNode(id: string) {
  return {
    id,
    key: 'image',
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    attrs: { src: 'https://example.com/a.png' },
  };
}

function lightPen(id: string) {
  return {
    id,
    key: 'shape',
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    attrs: { shapeType: 'pen', path: 'M0 10 L50 10', stroke: '#000', 'border-width': 2 },
  };
}

function heavy(id: string) {
  return {
    id,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    attrs: {
      shapeType: 'path',
      path: 'M0 0 ' + 'L1 1 '.repeat(HEAVY_PATH_D_CHARS),
    },
  };
}

describe('pickFullAndProxyIds', () => {
  it('demotes idle solid rects to Canvas under budget', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 20; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      zoom: 1,
      moving: false,
    });
    expect(fullIds).toHaveLength(0);
    expect(proxyIds).toHaveLength(20);
  });

  it('keeps text and pen as SVG hosts under budget (not idle-canvas eligible)', () => {
    const doc = makeDoc({
      t0: textNode('t0'),
      p0: lightPen('p0'),
      i0: imageNode('i0'),
    });
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ['t0', 'p0', 'i0'],
      keepSet: new Set(),
      zoom: 1,
      moving: false,
    });
    expect(fullIds.sort()).toEqual(['i0', 'p0', 't0']);
    expect(proxyIds).toEqual([]);
  });

  it('keeps media as SVG hosts when few', () => {
    const nodes: Record<string, any> = {
      i0: imageNode('i0'),
      n0: rect('n0'),
    };
    const doc = makeDoc(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ['i0', 'n0'],
      keepSet: new Set(),
      zoom: 1,
      moving: false,
    });
    expect(fullIds).toEqual(['i0']);
    expect(proxyIds).toEqual(['n0']);
  });

  it('forceFullSet keeps selected idle rect as SVG under far LOD', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 40; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: Object.keys(nodes),
      keepSet: new Set(['n0']),
      forceFullSet: new Set(['n0']),
      zoom: 0.15,
      moving: true,
    });
    expect(fullIds).toContain('n0');
    expect(proxyIds).not.toContain('n0');
  });

  it('caps full hosts and proxies the rest when far', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 120; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(['n0']),
      zoom: 0.15,
      moving: true,
    });
    // Idle rects skip SVG; selection keepSet must not force full SVG.
    expect(fullIds.length).toBe(0);
    expect(proxyIds.length).toBeGreaterThan(0);
    expect(fullIds.length + proxyIds.length).toBe(120);
  });

  it('caps proxy paint so dense zoom-out stays bounded', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 5000; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(['n0']),
      zoom: 0.15,
      moving: true,
      maxProxies: 128,
    });
    expect(fullIds.length).toBe(0);
    expect(proxyIds.length).toBeLessThanOrEqual(128);
    expect(fullIds.length + proxyIds.length).toBeLessThan(5000);
  });

  it('forceFullSet keeps editors as full SVG under LOD', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 120; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      forceFullSet: new Set(['n0']),
      zoom: 0.15,
      moving: true,
    });
    expect(fullIds).toContain('n0');
    expect(proxyIds).not.toContain('n0');
  });

  it('forceFullSet keeps idle rect as SVG even under budget', () => {
    const doc = makeDoc({ n0: rect('n0') });
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ['n0'],
      keepSet: new Set(),
      forceFullSet: new Set(['n0']),
      zoom: 1,
      moving: false,
    });
    expect(fullIds).toEqual(['n0']);
    expect(proxyIds).toHaveLength(0);
  });

  it('prefer SVG budget for media over idle rects when far', () => {
    const nodes: Record<string, any> = {};
    for (let i = 0; i < 40; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    nodes.i0 = imageNode('i0');
    nodes.big = rect('big', 400, 400);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      zoom: 0.15,
      moving: false,
    });
    expect(fullIds).toContain('i0');
    expect(fullIds).not.toContain('big');
    expect(proxyIds).toContain('big');
  });

  it('demotes heavy paths when far', () => {
    const nodes: Record<string, any> = {
      heavy: heavy('heavy'),
      big: rect('big', 400, 400),
    };
    for (let i = 0; i < 30; i += 1) nodes[`img${i}`] = imageNode(`img${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      zoom: 0.15,
      moving: true,
    });
    expect(proxyIds).toContain('heavy');
  });
});

describe('lodProxyIsStrokeOnly', () => {
  it('treats pencil/pen/line as stroke-only (no AABB fill)', () => {
    expect(lodProxyIsStrokeOnly({ attrs: { shapeType: 'pencil' } } as any)).toBe(true);
    expect(lodProxyIsStrokeOnly({ attrs: { shapeType: 'pen' } } as any)).toBe(true);
    expect(lodProxyIsStrokeOnly({ attrs: { shapeType: 'line' } } as any)).toBe(true);
  });

  it('treats unfilled path as stroke-only; filled rect as fill proxy', () => {
    expect(
      lodProxyIsStrokeOnly({
        attrs: { shapeType: 'path', path: 'M0 0 L10 10', 'fill-color': 'none' },
      } as any)
    ).toBe(true);
    expect(
      lodProxyIsStrokeOnly({
        attrs: { shapeType: 'rect', 'fill-color': '#abc' },
      } as any)
    ).toBe(false);
  });
});

describe('canIdlePaintOnCanvas', () => {
  it('allows solid stroke-free rect/ellipse; rejects stroke, shadow, complex fills, paths, text', () => {
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'rect', 'fill-color': '#fff', 'stroke-enabled': false },
      } as any)
    ).toBe(true);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'rect',
          'fill-type': 'linear',
          'fill-gradient': '{}',
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'rect',
          'fill-type': 'angular',
          'fill-gradient': '{}',
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'circle', 'fill-color': '#fff', 'stroke-enabled': false },
      } as any)
    ).toBe(true);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'rect',
          'fill-color': '#fff',
          'stroke-enabled': false,
          'shadow-enabled': true,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'rect', 'fill-color': '#fff', 'border-width': 2 },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'text',
        attrs: { ORIGIN_DATA: JSON.stringify([{ children: [{ text: 'a' }] }]) },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'pen', path: 'M0 0 L10 0', 'stroke-enabled': false },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'circle',
          ellipseInnerRatio: 0.4,
          'fill-color': '#fff',
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'circle',
          ellipseArcPercent: 55,
          'fill-color': '#fff',
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'polygon', sides: 6, 'stroke-enabled': false },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'star', sides: 5, 'stroke-enabled': false },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: { shapeType: 'triangle', 'stroke-enabled': false },
      } as any)
    ).toBe(false);
    expect(canIdlePaintOnCanvas({ key: 'image', attrs: {} } as any)).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'rect',
          'fill-type': 'image',
          'fill-image-src': 'data:image/png;base64,xx',
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'rect',
          'fill-type': 'diffuse',
          'fill-gradient': '{}',
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
    expect(
      canIdlePaintOnCanvas({
        key: 'shape',
        attrs: {
          shapeType: 'path',
          path: 'M0 0 ' + 'L1 1 '.repeat(HEAVY_PATH_D_CHARS),
          'stroke-enabled': false,
        },
      } as any)
    ).toBe(false);
  });
});
