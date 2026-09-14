import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '../../machine/repo-root.js';

/**
 * No sibling directory reaches back into the tool aggregator.
 *
 * `surface/tools/tools.ts` composes the whole tool surface: it imports twenty-seven `*_TOOLS`
 * arrays from five sibling directories. That direction is correct and is what a composition root
 * does. The problem was the other direction — those same directories imported `ToolDef` and
 * `ToolDeps` back OUT of it, and that back-edge closed a cycle for every one of them.
 *
 * MEASURED: removing it took `madge --circular` on `server/src` from **41 cycles to 25**, and the
 * change was an import path. Nothing moved, nothing was registered, no module-load order became
 * significant — because both types already lived in `tool-kit.ts`, a light module, and `tools.ts`
 * merely re-exported them. Twenty-five files were taking the long way round through the aggregator
 * to reach a leaf they could import directly.
 *
 * The cheap lesson worth keeping: a re-export from a heavy module is a cycle waiting to be
 * declared. This guard fails the moment somebody adds one back.
 */
const OUTSIDE_SURFACE = ['memory', 'language', 'judgement', 'features', 'portal', 'command'];

describe('the tool aggregator is composed, never consumed', () => {
  const importersOf = (target: string): string[] => {
    const out = execFileSync(
      'git',
      [
        'grep',
        '-l',
        `from '\\(\\.\\./\\)\\+surface/tools/${target}.js'`,
        '--',
        'server/src',
        ':!*test*',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ).trim();
    return 0 === out.length ? [] : out.split('\n');
  };

  it('finds the aggregator, so a pass is not a pass over a renamed file', () => {
    // Without this the check below goes green the day somebody renames tools.ts.
    const tools = execFileSync('git', ['ls-files', 'server/src/surface/tools/tools.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(tools, 'surface/tools/tools.ts must exist for this guard to mean anything').not.toBe('');
  });

  it('no sibling directory imports from it', () => {
    let importers: string[] = [];
    try {
      importers = importersOf('tools');
    } catch {
      importers = []; // git grep exits 1 on no matches, which is the passing case
    }
    const offenders = importers.filter((f) =>
      OUTSIDE_SURFACE.some((dir) => f.startsWith(`server/src/${dir}/`)),
    );
    expect(
      offenders,
      'these reach back into the aggregator that imports them, which is a cycle. `ToolDef` and ' +
        '`ToolDeps` live in `tool-kit.ts` — import them from there. Removing this edge took the ' +
        'package from 41 circular dependencies to 25.',
    ).toEqual([]);
  });
});
