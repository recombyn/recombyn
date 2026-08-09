import { describe, expect, it } from 'vitest';
import {
  pasteClipboardIntoDocument,
  validateSceneClipboard,
} from '@/components/rcb/scene/document/sceneClipboard';
import { createEmptyDocument } from '@/components/rcb/scene/document/sceneDocument';

describe('scene clipboard Zod', () => {
  it('accepts a valid node clip', () => {
    const result = validateSceneClipboard({
      nodes: [
        {
          id: 'a',
          node: { key: 'shape', x: 0, y: 0, width: 10, height: 10, attrs: {} },
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects empty / malformed clip', () => {
    expect(validateSceneClipboard({ nodes: [] }).valid).toBe(false);
    expect(
      validateSceneClipboard({
        nodes: [{ id: 'a', node: { key: 'shape' } }],
      }).valid
    ).toBe(false);
  });

  it('pasteClipboardIntoDocument no-ops on invalid payload', () => {
    const doc = createEmptyDocument({ width: 400, height: 400 });
    const out = pasteClipboardIntoDocument(doc, { nodes: [] } as any);
    expect(out.ids).toEqual([]);
    expect(out.frameIds).toEqual([]);
  });

  it('pastes a validated clip with new ids', () => {
    const doc = createEmptyDocument({ width: 400, height: 400 });
    const out = pasteClipboardIntoDocument(doc, {
      nodes: [
        {
          id: 'src',
          node: {
            key: 'shape',
            x: 10,
            y: 20,
            width: 40,
            height: 30,
            attrs: { shapeType: 'rect' },
          },
        },
      ],
    });
    expect(out.ids).toHaveLength(1);
    expect(out.ids[0]).not.toBe('src');
    expect(out.document.deltaSetLike[out.ids[0]]).toBeTruthy();
  });
});
