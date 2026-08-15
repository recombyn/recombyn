/**
 * Host-mirrored knob SVG must keep rotate when the live host transform is
 * translate-only (or missing) — otherwise radius dots stay axis-aligned.
 */
import { describe, expect, it } from 'vitest';
import { hostChromeBodyTransform } from '../sceneToSvg';

const box = { left: 100, top: 50, width: 200, height: 100 };

function svgEl(transform: string | null): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (transform) el.setAttribute('transform', transform);
  return el;
}

describe('hostChromeBodyTransform', () => {
  it('mirrored + translate-only host still applies angleDeg', () => {
    const el = svgEl('translate(100 50)');
    const t = hostChromeBodyTransform(el, box, 25, true);
    expect(t).toContain('translate(100 50)');
    expect(t).toMatch(/rotate\(\s*25\s+100\s+50\s*\)/);
  });

  it('mirrored + host already rotated — trust host (no double rotate)', () => {
    const el = svgEl('translate(100 50) rotate(25 100 50)');
    const t = hostChromeBodyTransform(el, box, 25, true);
    expect(t).toBe('translate(100 50) rotate(25 100 50)');
  });

  it('mirrored + missing host transform uses box + angle', () => {
    const t = hostChromeBodyTransform(null, box, -12.5, true);
    expect(t).toBe('translate(100 50) rotate(-12.5 100 50)');
  });

  it('non-mirrored applies box translate + angle', () => {
    const t = hostChromeBodyTransform(null, box, 8, false);
    expect(t).toBe('translate(100 50) rotate(8 100 50)');
  });

  it('angle ~0 stays translate-only', () => {
    const el = svgEl('translate(100 50)');
    expect(hostChromeBodyTransform(el, box, 0, true)).toBe('translate(100 50)');
  });
});
