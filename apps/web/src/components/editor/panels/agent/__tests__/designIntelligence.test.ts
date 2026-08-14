/**
 * P31 — Design Intelligence panel helpers (DNA / scores / diff / iterations).
 */
import { describe, expect, it } from 'vitest';
import {
  formatDiffDeltaLine,
  hasDesignIntelligence,
  pctLabel,
} from '../ChatTurnList';
import { mergeDesignIntelligence } from '../designAgentEventRouter';

describe('design intelligence panel', () => {
  it('formats percent and hero delta lines', () => {
    expect(pctLabel(0.42)).toBe('42%');
    expect(formatDiffDeltaLine('Hero', 0.26)).toBe('Hero +26%');
    expect(formatDiffDeltaLine('Whitespace', -0.01)).toBe('Whitespace -1%');
    expect(formatDiffDeltaLine('Hero', 0.001)).toBeNull();
  });

  it('detects intelligence payloads worth rendering', () => {
    expect(hasDesignIntelligence(undefined)).toBe(false);
    expect(hasDesignIntelligence({ review: { overall: 90 } })).toBe(true);
    expect(
      hasDesignIntelligence({
        reference: { dna: { minimalism: 0.8 }, thesis: 'museum relic' },
      })
    ).toBe(true);
    expect(
      hasDesignIntelligence({
        governance: { status: 'pass', lanes: [{ lane: 'brand', status: 'pass' }] },
      })
    ).toBe(true);
    expect(
      hasDesignIntelligence({
        summary: {
          thesis: 'museum relic',
          why: 'poster · collectors',
          nextSteps: ['突出主体：剑'],
        },
      })
    ).toBe(true);
  });

  it('merges reference / review / iteration patches', () => {
    const a = mergeDesignIntelligence(undefined, {
      reference: { thesis: 'sword', dna: { contrast: 0.7 } },
      review: { overall: 90, scores: { composition: 18 } },
      iterations: [{ iteration: 0, overall: 90 }],
      summary: { thesis: 'museum relic', why: 'poster' },
    });
    const b = mergeDesignIntelligence(a, {
      reference: { dna: { density: 0.3 } },
      diff: { deltas: { hero_coverage: 0.26 }, pixelAvailable: false },
      iterations: [{ iteration: 1, overall: 94 }],
      summary: {
        iterations: 2,
        scoreFrom: 90,
        scoreTo: 94,
        strengths: ['clear hero'],
        weaknesses: ['tight margins'],
        nextSteps: ['widen whitespace'],
      },
      governance: { status: 'pass', lanes: [{ lane: 'brand', status: 'pass' }] },
    });
    expect(b.reference?.thesis).toBe('sword');
    expect(b.reference?.dna).toEqual({ contrast: 0.7, density: 0.3 });
    expect(b.review?.overall).toBe(90);
    expect(b.diff?.deltas?.hero_coverage).toBe(0.26);
    expect(b.iterations?.map((x) => x.overall)).toEqual([90, 94]);
    expect(b.summary?.scoreTo).toBe(94);
    expect(b.summary?.thesis).toBe('museum relic');
    expect(b.summary?.nextSteps).toEqual(['widen whitespace']);
    expect(b.governance?.status).toBe('pass');
  });
});
