import type { FlowReplayResult } from '@reticlehq/core';
import { asString } from '@reticlehq/core';
import type { ToolDeps } from '../../surface/tools/tools.js';
import { flowsForSession } from './flow-store-for-session.js';

/**
 * Write back what a replay taught the flow, once the replay has finished writing its own.
 *
 * Deliberately OUTSIDE `replayNamedFlow`. Persisting from inside it broke the intent bookkeeping —
 * a replay records the intent it discharged on the same file, and a second writer in the middle of
 * that turned `proved` back into `bound`. The test that caught it is
 * `a passing replay marks the intent proved with the verdict that did it`, and the lesson is
 * general: a read-modify-write layered into someone else's transaction is a rollback wearing an
 * update's clothes.
 *
 * So this runs after the replay has returned and re-reads the flow first, merging only `learned`
 * onto whatever the file now says.
 *
 * Best-effort by construction: a store that refuses the write must not turn a completed replay into
 * a failed one. The verdict is about the app; this is bookkeeping about the flow, and losing a
 * lesson is a smaller loss than losing the run that produced it.
 */
export async function persistLearning(
  deps: ToolDeps,
  args: Record<string, unknown>,
  result: FlowReplayResult,
): Promise<FlowReplayResult> {
  const learned = result.learned;
  if (learned === undefined || 0 === learned.length) return result;
  const name = asString(args['flowName']) ?? '';
  if (0 === name.length) return result;
  try {
    let projectId: string | undefined;
    try {
      projectId = deps.sessions.resolve(asString(args['sessionId'])).projectId;
    } catch {
      projectId = undefined;
    }
    await flowsForSession(deps, projectId).flows.recordLearned(name, learned, projectId);
  } catch {
    // Bookkeeping only.
  }
  return result;
}
