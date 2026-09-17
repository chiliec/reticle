/**
 * The files `reticle init` WRITES into somebody's repo, checked against the surface they will meet.
 *
 * MEASURED by installing into a fresh app and driving it: `.claude/commands/reticle.md` — the first
 * thing an agent runs on a new project — told the reader to take a tab with
 * `reticle_run({ tool: "reticle_lease", … })`, and the default surface advertises neither name. The
 * always-loaded rule did the same for `reticle_run { tool, args }`, describing it as the way to
 * "reach any other by name".
 *
 * `live-call-text.ts` rewrites this class of thing at the RESULT boundary, and `agent-writer.test.ts`
 * covers the skill the server writes. A file written to disk once at install time passes through
 * neither: it is read months later, by an agent that never called a tool to get it.
 *
 * Judged against `advertisedTools`, NOT against the tool table. The table for the merged surface is
 * every tool with some of them folded together; the advertised set is the nine an agent is handed.
 * Checking the table is a guard that cannot fail, which `advertisedConfig` already warns about in
 * mcp.ts — and which the first version of this check did anyway, passing with `reticle_run` sitting
 * in the guidance.
 *
 * Read from disk rather than imported: `@reticlehq/init` does not export these strings, and widening
 * its public API to be testable from here is the wrong trade.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '@/machine/repo-root.js';
import { advertisedTools } from '@/surface/mcp/mcp.js';
import { TOOL_SURFACE } from './tool-surface.js';

/** The sources of the guidance init installs into a project. */
const WRITTEN_GUIDANCE = [
  join(REPO_ROOT, 'init', 'src', 'register', 'slash-command.ts'),
  join(REPO_ROOT, 'init', 'src', 'project', 'agent-rules.ts'),
];

/**
 * Block comments go as REGIONS, not as lines that look like one.
 *
 * Filtering lines that START with `*` also ate every Markdown bold line — `**A tool you need is
 * missing?**` — which is exactly where the guidance lives, so that version saw almost nothing and
 * passed for the wrong reason. A `reticle_state` in a header explaining an old defect is not advice,
 * and failing on one teaches the next reader to delete the explanation.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** Every `reticle_*` tool name in a piece of guidance. `reticle_*` as prose is not a call. */
function toolNamesIn(source: string): string[] {
  return [...new Set(withoutComments(source).match(/reticle_[a-z][a-z_]*/g) ?? [])];
}

describe('the files init writes name only tools the reader was given', () => {
  const advertised = new Set(advertisedTools(TOOL_SURFACE.MERGED).map((tool) => tool.name));

  it('finds the sources of the guidance init installs', () => {
    for (const file of WRITTEN_GUIDANCE) expect(existsSync(file), file).toBe(true);
  });

  // The negative control for the check below: if this set ever goes empty, the guard is vacuous.
  it('reads real tool names out of them', () => {
    for (const file of WRITTEN_GUIDANCE) {
      expect(toolNamesIn(readFileSync(file, 'utf8')).length, file).toBeGreaterThan(0);
    }
  });

  it('every reticle_* name in them is on the default surface', () => {
    const broken: string[] = [];
    for (const file of WRITTEN_GUIDANCE) {
      for (const name of toolNamesIn(readFileSync(file, 'utf8'))) {
        if (!advertised.has(name)) broken.push(`${file.slice(REPO_ROOT.length + 1)} -> ${name}`);
      }
    }
    expect(
      broken,
      `guidance init writes into a user's repo names tools the default surface does not advertise: ${broken.join(', ')}`,
    ).toEqual([]);
  });
});
