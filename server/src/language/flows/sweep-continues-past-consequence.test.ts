/**
 * A bug sweep gets one verdict per step; a regression flow still stops at the first break.
 *
 * The incident: driving the razorpay-blade-reticle merchant dashboard against its 23-defect ground
 * truth, `txn-sweep` — six steps, each declaring what that control SHOULD do — replayed as
 * `halted: { atStep: 0, notAttempted: 5 }`. Step 0's consequence was a defect, so the run stopped
 * on it and reported the other five defects as steps that were never attempted. Finding those five
 * then cost six more calls of hand-driving, which is the opposite of what replay is for.
 *
 * Halting was right while nothing could tell the two failures apart. `isConsequenceDrift` can: a
 * SIGNAL_NOT_OBSERVED / STATE_MISMATCH / EXPECT_ELEMENT_NOT_FOUND step resolved its anchor and ran
 * its action, so the page is exactly where the step left it and the next step is as meaningful as
 * it was going to be. A TESTID_NOT_FOUND step never found its element, so the page is somewhere the
 * flow never described and continuing would invent results rather than observe them.
 *
 * Both halves are asserted here. A `sweep` that also ran past an anchor miss would trade a missed
 * defect for a fabricated one, which is the worse bug of the two.
 */

import { describe, expect, it } from 'vitest';
import { isConsequenceDrift, DriftReason } from '@reticlehq/core';
import { FLOW_TOOLS } from './flow-tools.js';
import { ReticleTool } from '@reticlehq/core';

describe('isConsequenceDrift', () => {
  it('is true where the anchor resolved and only the assertion failed', () => {
    expect(isConsequenceDrift(DriftReason.SIGNAL_NOT_OBSERVED)).toBe(true);
    expect(isConsequenceDrift(DriftReason.STATE_MISMATCH)).toBe(true);
    expect(isConsequenceDrift(DriftReason.EXPECT_ELEMENT_NOT_FOUND)).toBe(true);
  });

  it('is false where the anchor itself was never resolved', () => {
    // These leave the page somewhere the flow never described. Sweeping past one would report
    // later steps as observations of a state nobody predicted.
    expect(isConsequenceDrift(DriftReason.TESTID_NOT_FOUND)).toBe(false);
    expect(isConsequenceDrift(DriftReason.COMPONENT_NOT_FOUND)).toBe(false);
    expect(isConsequenceDrift(DriftReason.ANCHOR_DEGRADED)).toBe(false);
  });

  it('classifies every reason the enum declares, so a new one cannot default silently', () => {
    for (const reason of Object.values(DriftReason)) {
      expect(typeof isConsequenceDrift(reason)).toBe('boolean');
    }
  });
});

describe('reticle_flow_replay', () => {
  it('advertises sweep, and says the default is the regression answer', () => {
    const replay = FLOW_TOOLS.find((t) => ReticleTool.FLOW_REPLAY === t.name);
    expect(replay, 'reticle_flow_replay is not in FLOW_TOOLS').toBeDefined();
    const sweep = replay?.inputSchema['sweep'];
    expect(sweep, 'sweep is not advertised, so no caller can reach it').toBeDefined();
    const described = String(sweep?.description ?? '');
    // The two halves a caller has to know before they trust the output.
    expect(described).toMatch(/per step/i);
    expect(described).toMatch(/anchor/i);
  });
});
