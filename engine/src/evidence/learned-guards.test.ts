import { describe, expect, it } from 'vitest';
import { learnFromRun, GuardState } from './learned-guards.js';

/**
 * A flow gets stricter every time it runs, without anybody writing a new assertion.
 *
 * The assertions a user writes by hand are the ones they thought of. The defects a drive actually
 * finds are the ones the app really has, and today they are reported once and forgotten: the next
 * replay of the same flow is exactly as blind to them as the first was. So a bug can be found, fixed
 * and silently return, and the flow that found it the first time says nothing.
 *
 * The loop that fixes this has to be careful in one specific way, and it is the reason this is a
 * pure function with tests rather than a line in the replay path.
 *
 * A contradiction observed RIGHT NOW is not an assertion. Asserting "this must not happen" while it
 * is happening makes the flow red on a defect the user already knows about, which trains them to
 * ignore it. And asserting "this DOES happen" is worse — it pins broken behaviour as expected, which
 * is a regression test that fires when somebody FIXES the bug.
 *
 * So a finding is remembered as an OPEN issue, and it only becomes a guard at the moment the run
 * stops showing it — the one moment the fix is a fact rather than a hope. From then on its return is
 * a regression, and that is the compounding: every defect this flow has ever seen and survived
 * becomes something it can never quietly reacquire.
 */
const seen = (kind: string, step = 0) => ({ kind, step });

describe('learnFromRun', () => {
  it('remembers a new contradiction as an OPEN issue, not as an assertion', () => {
    const r = learnFromRun({ guards: [], seen: [seen('request-never-settled')] });
    expect(r.guards).toHaveLength(1);
    expect(r.guards[0]?.state).toBe(GuardState.OPEN);
    expect(r.promoted).toHaveLength(0);
  });

  it('does NOT assert a defect that is currently happening', () => {
    // Asserting "must not happen" while it happens makes the flow red on a known bug, and a check
    // that is red for a reason the user already accepted is a check they learn to ignore.
    const r = learnFromRun({ guards: [], seen: [seen('stale-response-applied')] });
    expect(r.guards.every((g) => g.state === GuardState.OPEN)).toBe(true);
  });

  it('PROMOTES an open issue to a guard the moment the run stops showing it', () => {
    const before = [{ kind: 'request-never-settled', step: 0, state: GuardState.OPEN }];
    const r = learnFromRun({ guards: before, seen: [] });
    expect(r.guards[0]?.state).toBe(GuardState.GUARDED);
    expect(r.promoted).toEqual(['request-never-settled']);
  });

  it('keeps a guard guarded when the run is clean — the normal case, and it is silent', () => {
    const before = [{ kind: 'duplicate-request', step: 1, state: GuardState.GUARDED }];
    const r = learnFromRun({ guards: before, seen: [] });
    expect(r.guards[0]?.state).toBe(GuardState.GUARDED);
    expect(r.promoted).toHaveLength(0);
    expect(r.regressed).toHaveLength(0);
  });

  it('REPORTS A REGRESSION when a guarded defect comes back', () => {
    // The whole point. This flow proved once that this defect was gone; it is back.
    const before = [{ kind: 'duplicate-request', step: 1, state: GuardState.GUARDED }];
    const r = learnFromRun({ guards: before, seen: [seen('duplicate-request', 1)] });
    expect(r.regressed).toEqual(['duplicate-request']);
    expect(r.guards[0]?.state).toBe(GuardState.GUARDED);
  });

  it('tells a defect at one step from the same defect at another', () => {
    // `duplicate-request` at the login step and at the checkout step are different bugs.
    const before = [{ kind: 'duplicate-request', step: 1, state: GuardState.GUARDED }];
    const r = learnFromRun({ guards: before, seen: [seen('duplicate-request', 4)] });
    expect(r.regressed).toHaveLength(0);
    expect(r.guards).toHaveLength(2);
  });

  it('never records the same issue twice', () => {
    const before = [{ kind: 'request-never-settled', step: 0, state: GuardState.OPEN }];
    const r = learnFromRun({ guards: before, seen: [seen('request-never-settled')] });
    expect(r.guards).toHaveLength(1);
  });

  it('learns nothing from a run that observed nothing, rather than promoting everything', () => {
    // A run that could not observe is not a run that found the app clean. Promoting on it would
    // manufacture guards out of an absence of evidence — the false green, one level up.
    const before = [{ kind: 'request-never-settled', step: 0, state: GuardState.OPEN }];
    const r = learnFromRun({ guards: before, seen: [], observed: false });
    expect(r.guards[0]?.state).toBe(GuardState.OPEN);
    expect(r.promoted).toHaveLength(0);
  });
});
