import { test, expect } from '@playwright/test';

/**
 * Gate A — boolean result keeps operand corner radius for paint-time fillet
 * (inner L elbow). Loads modules through the Vite dev server (same origin).
 */
test.describe('boolean radii (vite modules)', () => {
  test('union of rounded rects propagates radius + fillets sharp verts', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const bool = await import(
        '/src/components/rcb/selection/shapeBoolean.ts'
      );
      const radii = await import(
        '/src/components/rcb/scene/document/sceneRadii.ts'
      );

      const boxes = [
        {
          left: 0,
          top: 0,
          width: 80,
          height: 160,
          shapeType: 'rect',
          attrs: { shapeType: 'rect', cornerRadius: 20 },
        },
        {
          left: 0,
          top: 0,
          width: 200,
          height: 60,
          shapeType: 'rect',
          attrs: { shapeType: 'rect', cornerRadius: 20 },
        },
      ];

      const { result: geo, usedFallback } = bool.computeShapeBoolean(boxes, 'union');
      if (!geo?.path) return { ok: false, reason: 'no path', usedFallback };

      const attrs: Record<string, unknown> = {
        radiusTL: 0,
        radiusTR: 0,
        radiusBR: 0,
        radiusBL: 0,
        radiusLinked: 'true',
      };
      bool.applyBooleanResultRadii(attrs, boxes);

      const r = { tl: 20, tr: 20, br: 20, bl: 20 };
      const filleted = radii.filletPathD(geo.path, r, attrs);
      const hasArc = /a\s/i.test(filleted);

      return {
        ok: !usedFallback && attrs.cornerRadius === 20 && hasArc,
        usedFallback,
        cornerRadius: attrs.cornerRadius,
        hasArc,
        pathLen: geo.path.length,
      };
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});
