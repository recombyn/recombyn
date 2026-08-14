import { describe, expect, it } from 'vitest';
import { snapTranslateToPeers, smartSnapThreshold } from '../alignGuides';

describe('snapTranslateToPeers (自动吸附)', () => {
  it('nudges to peer edge within screen threshold', () => {
    const left = { left: 0, top: 0, width: 100, height: 80, guideKind: 'peer' as const };
    const right = { left: 105, top: 4, width: 40, height: 40 };
    const { box, nudgeX, guides } = snapTranslateToPeers(right, [left], 8);
    expect(nudgeX).toBe(-5);
    expect(box.left).toBe(100);
    expect(guides.some((g) => g.kind === 'align' && g.axis === 'x' && g.at === 100)).toBe(true);
  });

  it('nudges top edges together', () => {
    const a = { left: 0, top: 20, width: 100, height: 80, guideKind: 'peer' as const };
    const b = { left: 120, top: 26, width: 50, height: 40 };
    const { box, nudgeY, guides } = snapTranslateToPeers(b, [a], 8);
    expect(nudgeY).toBe(-6);
    expect(box.top).toBe(20);
    expect(guides.some((g) => g.kind === 'align' && g.axis === 'y' && g.at === 20)).toBe(true);
  });

  it('does not snap when farther than threshold', () => {
    const left = { left: 0, top: 0, width: 100, height: 80, guideKind: 'peer' as const };
    const right = { left: 120, top: 0, width: 40, height: 40 };
    const { nudgeX, nudgeY } = snapTranslateToPeers(right, [left], 8);
    expect(nudgeX).toBe(0);
    expect(nudgeY).toBe(0);
  });

  it('frame only mid↔mid — edge does not park on plate center', () => {
    // Mover right edge near frame center (would be the old 假墙); peer edge closer for flush.
    const frame = {
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      guideKind: 'frame' as const,
    };
    const peer = { left: 0, top: 40, width: 100, height: 80, guideKind: 'peer' as const };
    // Want left=100 (flush to peer). Frame center x=200.
    const mover = { left: 108, top: 40, width: 50, height: 50 };
    const thr = smartSnapThreshold(1); // 8
    const { box, nudgeX } = snapTranslateToPeers(mover, [frame, peer], thr);
    expect(box.left).toBe(100);
    expect(nudgeX).toBe(-8);
    // Must not jump toward frame center (200 - 108 - 50 = 42… left would become ~150).
    expect(box.left).not.toBe(150);
  });
});
