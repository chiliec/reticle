import { describe, expect, it } from 'vitest';
import { liveCallText, liveCallValues } from './live-call-text.js';
import { ReticleTool } from '@reticlehq/core';

/**
 * Guidance that names a tool the reader was not given.
 *
 * MEASURED on the nine-tool surface, driving it over a real MCP client: three separate pieces of
 * advice routed the agent to `reticle_run` or `reticle_lease`, neither of which that surface
 * advertises — including the no-session diagnosis, which is the FIRST text an agent reads and the
 * one shown when nothing is connected yet. Its `NEXT ACTION` was a dead end with no alternative
 * given, and the command-timeout recovery went further and explained that `reticle_lease` "is
 * reached through reticle_run, not called directly" — a specific, confident instruction to call a
 * tool the same surface removes by name.
 *
 * `surface-vocabulary.ts` already solved this for the briefing, and its own header says a briefing
 * naming a tool the agent lacks should be "unrepresentable rather than merely tested for". That
 * reasoning was never applied to the text attached to RESULTS, which is where an agent reads most
 * of its advice and all of it under failure.
 */
const MERGED = new Set<string>([
  ReticleTool.NAVIGATE,
  ReticleTool.ACT,
  ReticleTool.ACT_AND_WAIT,
  ReticleTool.LOOK,
  ReticleTool.OBSERVE,
  ReticleTool.ASSERT,
  ReticleTool.SESSION,
  ReticleTool.VERIFY,
]);
/** A surface that really does advertise the dispatch hatch: nothing should be rewritten. */
const FULL = new Set<string>([...MERGED, ReticleTool.RUN, ReticleTool.LEASE, ReticleTool.SESSIONS]);

describe('advice names a call the reader can actually make', () => {
  it('rewrites a merged name to the call that replaced it', () => {
    expect(liveCallText('Call reticle_sessions to list them.', MERGED)).toBe(
      'Call reticle_session { action: "list" } to list them.',
    );
  });

  it('leaves a name the surface really advertises alone', () => {
    const text = 'Call reticle_sessions to list them.';
    expect(liveCallText(text, FULL)).toBe(text);
  });

  it('replaces the lease escape hatch with one that exists when neither tool is advertised', () => {
    const out = liveCallText(
      'drive your own browser with reticle_run { tool: "reticle_lease", action: "acquire", url }',
      MERGED,
    );
    expect(out).not.toContain('reticle_run');
    expect(out).not.toContain('reticle_lease');
    // The CLI is the escape hatch that survives on every surface, because it is not a tool.
    expect(out).toContain('reticle open');
  });

  it('keeps the lease advice verbatim where the tools exist', () => {
    const text =
      'drive your own browser with reticle_run { tool: "reticle_lease", action: "acquire", url }';
    expect(liveCallText(text, FULL)).toBe(text);
  });

  it('rewrites the ESCAPED form, which is the one that actually ships', () => {
    // The rewrite runs over the serialised payload, so this is the shape it really meets. The first
    // implementation handled only unescaped quotes: every unit test passed and the live daemon was
    // unchanged.
    const serialised = JSON.stringify({
      recovery:
        'drive your own browser with reticle_run { tool: "reticle_lease", action: "acquire", url }',
    });
    const out = liveCallText(serialised, MERGED);
    expect(out).not.toContain('reticle_run');
    expect(out).not.toContain('reticle_lease');
    const parsed = JSON.parse(out) as { recovery: string };
    expect(parsed.recovery).toContain('reticle open');
  });

  it('redirects flow management on a surface that has no flow tool and no CLI for it', () => {
    const out = liveCallText('run reticle_flow{action:"list"} to see saved flows', MERGED);
    expect(out).not.toContain('reticle_flow{');
    expect(out).toContain('reticle_verify { action: "flows" }');
  });

  it('rewrites the VALUES of a result without breaking it, quotes and all', () => {
    /*
     * The first version ran over the serialised payload, and its replacements contain double
     * quotes -- `reticle_verify { action: "flows" }`. Injected into an already-encoded JSON string
     * those quotes are not escaped, so the payload stopped parsing and every client reading it saw
     * nothing at all.
     *
     * MEASURED: three e2e specs that pass on the commit before this one went red, each reporting
     * an EMPTY session list, because the sessions payload carries a diagnostic that names
     * `reticle_flow`. The rewrite corrupted the envelope around the data it was describing. Found
     * by running the battery against the parent commit and diffing the two arms, not by the suite.
     */
    const payload = {
      why: 'run reticle_flow{action:"list"} to see saved flows',
      sessions: [{ id: 's1' }],
    };
    const out = liveCallValues(payload, MERGED) as typeof payload;
    expect(JSON.stringify(out)).toContain('reticle_verify');
    // The shape survives: this is the half that broke.
    expect(out.sessions).toEqual([{ id: 's1' }]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('walks nested values and arrays, leaving non-strings alone', () => {
    const out = liveCallValues(
      { a: { b: ['call reticle_sessions', 7, null, true] }, n: 3 },
      MERGED,
    ) as { a: { b: unknown[] }; n: number };
    expect(out.a.b[0]).toBe('call reticle_session { action: "list" }');
    expect(out.a.b.slice(1)).toEqual([7, null, true]);
    expect(out.n).toBe(3);
  });

  it('leaves text naming no tool untouched', () => {
    const text = 'The page did not answer within the command window.';
    expect(liveCallText(text, MERGED)).toBe(text);
  });

  it('rewrites every occurrence, not just the first', () => {
    const out = liveCallText('reticle_sessions then reticle_sessions again', MERGED);
    expect(out).not.toContain('reticle_sessions');
  });
});
