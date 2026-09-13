import { describe, expect, it } from 'vitest';
import { Surface } from '@reticlehq/openverification';
import { AppRuntime } from '../telemetry-feedback.js';
import { realmOf, surfaceOf, REALMS } from './registry.js';

/**
 * A realm says which surface it is. Nothing works it out from a boolean.
 *
 * The protocol names six surfaces — web, desktop, mobile, service, game, device — and carries a
 * determinism row for every one of them. `surfaceOf` could return two, because it asked
 * `isDesktopShell ? DESKTOP : WEB`. So a mobile, service, game or device realm had no way to be
 * NAMED even though the rules that govern it were already written, and the first thing anybody
 * adding a domain would hit is a ternary that answers `web` to everything it has not heard of.
 *
 * A boolean can answer two questions. A surface is not a question with two answers, and this is
 * what makes adding a domain a row in a table rather than an edit to a branch.
 */
describe('a realm declares its surface', () => {
  it('every realm in the table declares one', () => {
    for (const [runtime, traits] of Object.entries(REALMS)) {
      expect(traits.surface, `${runtime} must declare its surface`).toBeDefined();
    }
  });

  it('the shells we ship answer what they always answered', () => {
    expect(surfaceOf(AppRuntime.WEB)).toBe(Surface.WEB);
    expect(surfaceOf(AppRuntime.ELECTRON)).toBe(Surface.DESKTOP);
    expect(surfaceOf(AppRuntime.TAURI)).toBe(Surface.DESKTOP);
  });

  it('an unknown runtime still answers web, and that is still an assumption', () => {
    // Unchanged on purpose: a SubjectRef requires a surface and the handshake carries no other
    // tell, so the error stays "a desktop app read as a page" — understating, not misdescribing.
    expect(surfaceOf(undefined)).toBe(Surface.WEB);
    expect(surfaceOf('something-nobody-has-written-yet')).toBe(Surface.WEB);
  });

  it('reads the realm rather than re-deriving it from isDesktopShell', () => {
    // The property that makes a new surface possible: whatever the table says is what comes back.
    for (const runtime of Object.keys(REALMS)) {
      expect(surfaceOf(runtime)).toBe(realmOf(runtime).surface);
    }
  });

  it('the protocol offers four surfaces this product cannot yet name', () => {
    // Not a defect — a statement of where the wall is. These have determinism rows already, and
    // the moment a realm declares one of them, `surfaceOf` returns it with no further change.
    const declared = new Set(Object.values(REALMS).map((r) => r.surface));
    for (const unreached of [Surface.MOBILE, Surface.SERVICE, Surface.GAME, Surface.DEVICE]) {
      expect(declared.has(unreached), `${unreached} is not claimed by any shipped realm`).toBe(
        false,
      );
    }
  });
});
