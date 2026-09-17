import { describe, expect, it } from 'vitest';
import { remainingSteps, type Progress } from './remaining-steps.js';

const at = (p: Partial<Progress>): Progress => ({
  initDone: false,
  devServerUp: false,
  sessionConnected: false,
  flowSaved: false,
  urlSuppliedByCaller: false,
  ...p,
});

describe('picking up where setup stopped', () => {
  it('starts at init when nothing has happened', () => {
    expect(remainingSteps(at({}))[0]).toContain('init');
  });

  // The point of the whole module: a run that got past init must not be told to re-run it.
  it('never tells you to redo a step that already worked', () => {
    const steps = remainingSteps(
      at({ initDone: true, devServerUp: true, devCommand: 'npm run dev' }),
    );
    expect(steps.join(' ')).not.toContain('npx @reticlehq/server@latest init');
    expect(steps[0]).toContain('reticle_session { action: "list" }');
  });

  it('names the dev command when the server is the missing piece', () => {
    expect(remainingSteps(at({ initDone: true, devCommand: 'pnpm dev -p 3100' }))[0]).toContain(
      'pnpm dev -p 3100',
    );
  });

  // Someone who passed --url is already running their server; telling them to start it is noise.
  it('does not tell a caller who supplied a url to start a server', () => {
    const steps = remainingSteps(
      at({ initDone: true, urlSuppliedByCaller: true, url: 'http://localhost:3000/' }),
    );
    expect(steps.join(' ')).not.toContain('Start the dev server');
  });

  it('names the url in the session step when there is one', () => {
    expect(
      remainingSteps(at({ initDone: true, devServerUp: true, url: 'http://localhost:5173/' })).join(
        ' ',
      ),
    ).toContain('http://localhost:5173/');
  });

  /*
   * This used to assert the instruction said `asserted` — check the GRADE of a saved flow, because
   * one that only acts passes even when the feature is broken. Onboarding no longer drives or saves
   * anything, so that instruction is gone and the fallback hands the first run over instead.
   *
   * What replaces it is the same duty one step earlier: a reader here has a connected app and no
   * proof, and must be given a route that WORKS. Both are named because `explore` needs a key, and
   * naming only that one is a dead end on a machine without one.
   */
  it('hands over the first run, naming a route that needs no key and one that does', () => {
    const drive = remainingSteps(
      at({ initDone: true, devServerUp: true, sessionConnected: true }),
    ).join(' ');
    expect(drive).toContain('reticle_act_and_wait');
    expect(drive).toContain('reticle_verify { action: "explore"');
    expect(drive, 'the key requirement must be stated, or explore is a dead end').toContain(
      'ANTHROPIC_API_KEY',
    );
  });

  it('leaves only the docs pointer when everything succeeded', () => {
    const steps = remainingSteps(
      at({ initDone: true, devServerUp: true, sessionConnected: true, flowSaved: true }),
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toContain('docs.reticle.sh');
  });
});
