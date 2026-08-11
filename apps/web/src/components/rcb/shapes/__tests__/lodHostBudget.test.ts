import { describe, expect, it } from 'vitest';
import { lodProxyIsStrokeOnly, pickFullAndProxyIds } from '../RcbShapesLayer';
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
    x: 0,
    y: 0,
    width: w,
    height: h,
    attrs: { shapeType: 'rect', 'fill-color': '#abc' },
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
  it('keeps all hosts when few and zoomed in', () => {
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
    expect(fullIds).toHaveLength(20);
    expect(proxyIds).toHaveLength(0);
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
    // Selection keepSet must not force full SVG while LOD is active.
    expect(fullIds.length).toBeLessThanOrEqual(24);
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
    expect(fullIds.length).toBeLessThanOrEqual(24);
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
      keepSet: new Set(['n0']),
      forceFullSet: new Set(['n0']),
      zoom: 0.15,
      moving: false,
    });
    expect(fullIds).toContain('n0');
    expect(proxyIds).not.toContain('n0');
  });

  it('selection keepSet alone does not promote under far LOD', () => {
    // Tiny n0 loses the host budget to large siblings unless keepSet forces it.
    const nodes: Record<string, any> = { n0: rect('n0', 2, 2) };
    for (let i = 1; i < 120; i += 1) nodes[`n${i}`] = rect(`n${i}`, 400, 400);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(['n0']),
      zoom: 0.15,
      moving: false,
    });
    expect(proxyIds).toContain('n0');
    expect(fullIds).not.toContain('n0');
  });

  it('demotes heavy paths when force-lod', () => {
    const nodes: Record<string, any> = {
      big: rect('big', 400, 400),
      heavy: heavy('heavy'),
    };
    for (let i = 0; i < 50; i += 1) nodes[`n${i}`] = rect(`n${i}`);
    const doc = makeDoc(nodes);
    const ids = Object.keys(nodes);
    const { fullIds, proxyIds } = pickFullAndProxyIds({
      document: doc,
      visibleIds: ids,
      keepSet: new Set(),
      zoom: 0.15,
      moving: true,
    });
    expect(fullIds).toContain('big');
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
