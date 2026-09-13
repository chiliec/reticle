import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../machine/repo-root.js';

/**
 * What a replay learns reaches the flow file, and does it without trampling anything else.
 *
 * Two failures are possible here and only one of them is obvious.
 *
 * The obvious one: the learning is computed, returned, and never written, so every run re-learns
 * the same lesson and nothing compounds. That is the module built-and-unwired shape this project
 * keeps paying for.
 *
 * The one that actually happened: it IS written, through `saveFlow`, which re-runs intent linking
 * over the whole document — so persisting a learned guard reverted an intent the same replay had
 * just discharged, turning `proved` back into `bound`. A whole-document save is not a field update.
 * This asserts the narrow writer is the one used, because the wide one passes typecheck and looks
 * identical at the call site.
 */
const read = (...p: string[]): string => readFileSync(join(REPO_ROOT, ...p), 'utf8');

describe('learning reaches the flow file', () => {
  it('the replay computes it', () => {
    const src = read('server', 'src', 'language', 'flows', 'flow-replay-run.ts');
    expect(src).toContain('learnFromRun(');
    expect(src).toContain('result.learned');
  });

  it('something persists it — otherwise nothing compounds', () => {
    const src = read('server', 'src', 'language', 'flows', 'flow-learning.ts');
    expect(src).toContain('recordLearned(');
  });

  it('persistence uses the NARROW writer, never saveFlow', () => {
    // saveFlow re-runs #linkIntent over the whole document. Using it here reverted a discharged
    // intent, and the only thing that caught it was an unrelated intent test.
    const src = read('server', 'src', 'language', 'flows', 'flow-learning.ts');
    expect(src).not.toContain('saveFlow(');
  });

  it('the narrow writer touches only `learned`', () => {
    const src = read('server', 'src', 'language', 'flows', 'flows.ts');
    expect(src).toContain('async recordLearned(');
    expect(src).toContain('{ ...loaded.value, learned }');
  });

  it('persistence runs OUTSIDE the replay, after it has finished its own writes', () => {
    const replay = read('server', 'src', 'language', 'flows', 'flow-replay-run.ts');
    expect(replay, 'the replay must not write the flow file itself').not.toContain(
      'recordLearned(',
    );
    expect(read('server', 'src', 'language', 'flows', 'flow-tools.ts')).toContain(
      'persistLearning(',
    );
  });

  it('the flow file can carry it', () => {
    expect(read('core', 'src', 'artifacts', 'flow-types.ts')).toContain('learned: z');
  });
});
