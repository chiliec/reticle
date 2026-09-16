/**
 * The config surface, driven against REAL child processes.
 *
 * Deliberately not a mocked `spawn`. The things worth knowing here are all about how a real process
 * behaves — that the payload arrives on stdin as parseable JSON, that a non-zero exit is survivable,
 * that a command reading nothing does not raise EPIPE into the daemon — and a mock would assert that
 * we called spawn with the arguments we just wrote down, which proves only that the test was
 * updated alongside the code.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HookEvent, type HookPayload } from '@reticlehq/core/hooks';
import { ReticleDir } from '@reticlehq/core';
import { emitHook, resetHooks } from './hook-bus.js';
import { installCommandHooks, readHookConfig } from './hook-commands.js';

/**
 * A generous ceiling, never a duration assertion.
 *
 * These tests spawn REAL processes and poll a real temp directory, which is milliseconds on a quiet
 * laptop and seconds on a loaded CI runner. What is being asserted is that the child received the
 * payload, not how fast — and a bound tight enough to measure speed is a test that fails only under
 * parallel load, which is the failure this repo has already paid for twice.
 */
const HOOK_SPAWN_TIMEOUT_MS = 30_000;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reticle-hooks-'));
});

afterEach(() => {
  resetHooks();
  rmSync(root, { recursive: true, force: true });
});

const writeConfig = (config: Record<string, string>): void => {
  writeFileSync(join(root, ReticleDir.HOOKS_FILE), JSON.stringify(config));
};

const bug = (): HookPayload => ({
  event: HookEvent.BUG_FOUND,
  at: '2026-01-01T00:00:00.000Z',
  kind: 'response-ignored',
  repeat: false,
  tool: 'reticle_act_and_wait',
});

/** Wait for a file the hook writes, so the test observes the CHILD rather than a timer. */
async function waitForFile(path: string, budgetMs = 10_000): Promise<string | undefined> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
    await new Promise((r) => setTimeout(r, 25));
  }
  return undefined;
}

describe('reading .reticle/hooks.json', () => {
  it('is empty when the file does not exist — the normal case', () => {
    expect(readHookConfig(root)).toEqual({});
  });

  it('reads an event to a command', () => {
    writeConfig({ [HookEvent.BUG_FOUND]: 'echo hi' });
    expect(readHookConfig(root)[HookEvent.BUG_FOUND]).toBe('echo hi');
  });

  it('drops an event name Reticle does not have, and keeps the ones it does', () => {
    writeConfig({ [HookEvent.VERDICT]: 'echo real', on_bug_founded: 'echo typo' });
    const config = readHookConfig(root);
    expect(config[HookEvent.VERDICT]).toBe('echo real');
    expect(Object.hasOwn(config, 'on_bug_founded'), 'a typo must not silently do nothing').toBe(
      false,
    );
  });

  it('survives a malformed file rather than taking the daemon with it', () => {
    writeFileSync(join(root, ReticleDir.HOOKS_FILE), '{not json');
    expect(() => readHookConfig(root)).not.toThrow();
    expect(readHookConfig(root)).toEqual({});
  });

  it('picks up an edit without a restart', () => {
    writeConfig({ [HookEvent.VERDICT]: 'echo first' });
    expect(readHookConfig(root)[HookEvent.VERDICT]).toBe('echo first');
    // A different mtime is what invalidates the cache, and a fast test can write twice inside one
    // millisecond — so this asserts the BEHAVIOUR with a distinguishable mtime rather than racing it.
    writeFileSync(join(root, ReticleDir.HOOKS_FILE), JSON.stringify({ verdict: 'echo second' }), {
      flag: 'w',
    });
    const later = new Date(Date.now() + 2000);
    utimesSync(join(root, ReticleDir.HOOKS_FILE), later, later);
    expect(readHookConfig(root)[HookEvent.VERDICT]).toBe('echo second');
  });
});

describe('running a hook command', () => {
  it(
    'hands the payload to the child on stdin, as JSON it can parse',
    async () => {
      const out = join(root, 'got.json');
      writeConfig({ [HookEvent.BUG_FOUND]: `cat > ${JSON.stringify(out)}` });
      installCommandHooks(root);
      emitHook(bug());
      const written = await waitForFile(out);
      expect(written, 'the child never received the payload').toBeDefined();
      const parsed = JSON.parse(written ?? '{}') as Record<string, unknown>;
      expect(parsed['event']).toBe(HookEvent.BUG_FOUND);
      expect(parsed['kind']).toBe('response-ignored');
    },
    HOOK_SPAWN_TIMEOUT_MS,
  );

  it(
    'runs nothing for an event with no command',
    async () => {
      const out = join(root, 'should-not-exist');
      writeConfig({ [HookEvent.VERDICT]: `cat > ${JSON.stringify(out)}` });
      installCommandHooks(root);
      emitHook(bug()); // bug_found, not verdict
      await new Promise((r) => setTimeout(r, 300));
      expect(existsSync(out)).toBe(false);
    },
    HOOK_SPAWN_TIMEOUT_MS,
  );

  /*
   * The promise the whole design rests on. A user's broken script is a log line, never a verdict.
   */
  it('does not throw when the command exits non-zero', () => {
    writeConfig({ [HookEvent.BUG_FOUND]: 'exit 3' });
    installCommandHooks(root);
    expect(() => emitHook(bug())).not.toThrow();
  });

  it('does not throw when the command does not exist at all', () => {
    writeConfig({ [HookEvent.BUG_FOUND]: 'this-command-does-not-exist-anywhere' });
    installCommandHooks(root);
    expect(() => emitHook(bug())).not.toThrow();
  });

  it('does not raise EPIPE when the command never reads stdin', () => {
    writeConfig({ [HookEvent.BUG_FOUND]: 'true' });
    installCommandHooks(root);
    expect(() => emitHook(bug())).not.toThrow();
  });

  /*
   * The payload is DATA, never part of the command line.
   *
   * A defect's own text comes from the app under test, so if it were interpolated into a shell
   * command the app could choose what Reticle runs on the developer's machine. The child here would
   * create `pwned` only if that were happening.
   */
  it(
    'cannot be made to run a command by the CONTENT of a payload',
    async () => {
      const out = join(root, 'got.json');
      const pwned = join(root, 'pwned');
      writeConfig({ [HookEvent.BUG_FOUND]: `cat > ${JSON.stringify(out)}` });
      installCommandHooks(root);
      emitHook({ ...bug(), kind: `x"; touch ${JSON.stringify(pwned)}; echo "` } as HookPayload);
      await waitForFile(out);
      expect(existsSync(pwned), 'payload content reached the command line').toBe(false);
    },
    HOOK_SPAWN_TIMEOUT_MS,
  );
});
