import { describe, expect, it } from 'vitest';
import { hitTestSceneAtPoint } from '../sceneHitBridge';
import type { SceneDocument } from '@/components/rcb/sceneNode';

function rectDoc(): SceneDocument {
  return {
    deltaSetLike: {
      ROOT: { children: ['a', 'b'] },
      a: {
        id: 'a',
        key: 'shape',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        attrs: { shapeType: 'rect', 'fill-color': '#fff', 'fill-enabled': 'true' },
      },
      b: {
        id: 'b',
        key: 'shape',
        x: 200,
        y: 0,
        width: 40,
        height: 40,
        attrs: { shapeType: 'rect', 'fill-color': '#fff', 'fill-enabled': 'true' },
      },
    },
  } as unknown as SceneDocument;
}

describe('hitTestSceneAtPoint', () => {
  it('hits topmost candidate first', () => {
    const doc = rectDoc();
    const getNodeBox = (id: string) => {
      const n = doc.deltaSetLike[id as 'a' | 'b'];
      return { left: n.x, top: n.y, width: n.width, height: n.height };
    };
    expect(
      hitTestSceneAtPoint({
        document: doc,
        order: ['b', 'a'],
        x: 10,
        y: 10,
        zoom: 1,
        getNodeBox,
      })
    ).toBe('a');
    expect(
      hitTestSceneAtPoint({
        document: doc,
        order: ['b', 'a'],
        x: 210,
        y: 10,
        zoom: 1,
        getNodeBox,
      })
    ).toBe('b');
    expect(
      hitTestSceneAtPoint({
        document: doc,
        order: ['b', 'a'],
        x: 500,
        y: 500,
        zoom: 1,
        getNodeBox,
      })
    ).toBeNull();
  });
});
