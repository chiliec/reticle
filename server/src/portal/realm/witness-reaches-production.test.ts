import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../machine/repo-root.js';
import { RECONCILE_TOOLS } from '../../surface/tools/reconcile-tools.js';
import { ReticleTool } from '@reticlehq/core';

/**
 * The outside observer is reachable from a tool an agent can actually call.
 *
 * `Witness` shipped as a specification, a base class and a reference HTTP implementation, and for
 * its whole life nothing constructed one on any path a user could reach. Cross-realm disagreement —
 * the strongest finding this project can produce, and the only one that survives an app lying to
 * itself — had never fired once.
 *
 * The sibling of this file, `protocol-reaches-production.test.ts`, exists for exactly this failure
 * and states it plainly: built in three pieces and joined in none. So this test asserts the SEAM
 * rather than the comparison, because the comparison already had tests while being unreachable, and
 * that combination is what made the gap invisible.
 */
describe('the witness is reachable from the surface', () => {
  const reconcile = RECONCILE_TOOLS.find((t) => t.name === ReticleTool.RECONCILE);

  it('reticle_reconcile accepts a witness', () => {
    expect(reconcile, 'reticle_reconcile must exist').toBeDefined();
    expect(Object.keys(reconcile?.inputSchema ?? {})).toContain('witness');
  });

  it('and can report one, so a disagreement has somewhere to land', () => {
    expect(Object.keys(reconcile?.outputSchema ?? {})).toContain('witness');
  });

  it('the handler really consults it — not just declares it', () => {
    // A schema that accepts an argument the handler ignores is the exact shape of the defect this
    // file is named after: it parses, it looks wired, and it can never produce a finding.
    const src = readFileSync(
      join(REPO_ROOT, 'server', 'src', 'surface', 'tools', 'reconcile-tools.ts'),
      'utf8',
    );
    expect(src).toContain('witnessDisagreement(');
    expect(src, 'the outside observer is consulted over the network').toMatch(/await fetch\(url/);
  });

  it('an unreachable observer is inconclusive, never agreement', () => {
    // The one safety property that must survive every future edit here.
    const src = readFileSync(
      join(REPO_ROOT, 'engine', 'src', 'disagreement', 'witness-disagreement.ts'),
      'utf8',
    );
    expect(src).toContain('inconclusive: true');
  });
});
