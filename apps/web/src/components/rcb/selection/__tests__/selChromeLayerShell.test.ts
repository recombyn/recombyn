/**
 * Regression: path chrome mounts on `[data-rcb-overlay]` (ADR 0027).
 * Full-bleed pe:none shell; hits via geometry / world pads — not SVG pe.
 */
import { describe, expect, it } from 'vitest';
import { selChromeLayerShell } from '../HostPathChrome';

describe('selChromeLayerShell', () => {
  it('is a full-bleed overlay shell (screen space)', () => {
    const shell = selChromeLayerShell();
    expect(shell.width).toBe('100%');
    expect(shell.height).toBe('100%');
    expect(shell.pointerEvents).toBe('none');
    expect(shell.className).toContain('inset-0');
    expect(shell.className).toContain('overflow-visible');
    expect(shell.className).toContain('pointer-events-none');
  });

  it('stacks with other screen chrome (z 18)', () => {
    expect(Number(selChromeLayerShell().zIndex)).toBe(18);
  });
});
