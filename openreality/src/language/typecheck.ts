/**
 * TYPECHECK — refuse a document before an action is spent.
 *
 * `Realm.perform` already refuses an undeclared capability. It does so at RUNTIME, one action at a
 * time, after the action has been dispatched and the subject has already moved. That is the right
 * answer to the wrong question: a journey recorded on a browser and replayed on a realm that cannot
 * swipe should be refused as a DOCUMENT, naming what is missing, rather than discovered at step 7 of
 * a journey that has already half-happened and cannot be un-happened.
 *
 * It is the protocol's own rule applied to a whole program instead of one claim — *a claim reading a
 * channel that is not here is `unknown` immediately, rather than after the action has been spent.*
 *
 * It is also what turns portability from an aspiration into a CHECK. The same source document runs
 * on any realm whose instruction set covers it, and when it does not, this says which capability is
 * missing rather than failing halfway.
 *
 * Pure, and deliberately ignorant of any particular flow format: a program is a list of (capability,
 * channels it reads), and any tool that can produce that can be typechecked without importing a line
 * of Reticle's TypeScript.
 */

import type { ChannelId } from '../vocabulary/channel.js';

export const TypeErrorKind = {
  /** The realm cannot do this. Checked against `capabilities()`. */
  UNDECLARED_CAPABILITY: 'undeclared-capability',
  /** The realm cannot SEE this. Checked against `channels()`. */
  UNOBSERVED_CHANNEL: 'unobserved-channel',
  /** An `invoke` names a document that is not in the set being checked. */
  UNRESOLVED_FLOW: 'unresolved-flow',
  /** Following `invoke` edges comes back to a document already on the path. */
  CYCLIC_INVOCATION: 'cyclic-invocation',
} as const;
export type TypeErrorKind = (typeof TypeErrorKind)[keyof typeof TypeErrorKind];

export interface FlowTypeError {
  /** 0-based index of the offending step, so a fix has an address. */
  step: number;
  kind: TypeErrorKind;
  detail: string;
}

/** One step, reduced to what a typecheck needs: what it does, and what it reads to know it worked. */
export interface ProgramStep {
  capability: string;
  reads?: readonly ChannelId[];
}

/** What the target realm says it can do and see — `capabilities()` and `channels()`, nothing else. */
export interface RealmSurface {
  capabilities: readonly string[];
  channels: readonly ChannelId[];
}

/**
 * Every problem, not just the first.
 *
 * A compiler that stops at the first error makes the caller re-run it once per mistake, and the
 * caller here is often an agent paying a turn each time. One pass, one fix list.
 *
 * An EMPTY program typechecks. It asserts nothing, which is a coverage question and a real one —
 * but it is not a type error, and conflating the two would have this refuse documents for being
 * weak rather than for being unrunnable.
 */
export function typecheckProgram(
  steps: readonly ProgramStep[],
  realm: RealmSurface,
): FlowTypeError[] {
  const canDo = new Set(realm.capabilities);
  const canSee = new Set<string>(realm.channels);
  const errors: FlowTypeError[] = [];
  steps.forEach((step, index) => {
    if (!canDo.has(step.capability)) {
      errors.push({
        step: index,
        kind: TypeErrorKind.UNDECLARED_CAPABILITY,
        detail: `this realm cannot "${step.capability}"; it declares: ${realm.capabilities.join(', ') || '(nothing)'}`,
      });
      // One finding per step: a step that cannot run is not also interesting for what it would have
      // read. Reporting both would pad the list with consequences of the error already named.
      return;
    }
    for (const channel of step.reads ?? []) {
      if (canSee.has(channel)) continue;
      errors.push({
        step: index,
        kind: TypeErrorKind.UNOBSERVED_CHANNEL,
        detail: `step reads "${channel}", which this realm does not observe; it sees: ${realm.channels.join(', ') || '(nothing)'}`,
      });
    }
  });
  return errors;
}

/** A document reduced to what composition needs: its name, and what it invokes, in order. */
export interface CompositeDocument {
  name: string;
  steps: readonly { invoke?: string }[];
}

/**
 * Refuse a composite by READING it — no realm, no subject, no action spent.
 *
 * Both failures here are unrecoverable at runtime and cheap to find at rest. A cycle discovered
 * while replaying is an infinite replay. A missing sub-document discovered while replaying is a
 * journey abandoned midway, with the subject left wherever it got to and nothing able to put it
 * back. Neither is a verdict about the app, so neither should cost the app anything.
 *
 * Depth-first with a path stack rather than a visited set alone, because the PATH is the whole
 * value of a cycle message: "there is a cycle somewhere" sends a reader through every document to
 * find what this already knew. A diamond — two routes to one leaf — is reuse, which is the point of
 * composition, so a document already finished is not a cycle and is not re-walked.
 *
 * Pure, and ignorant of any flow format: anything that can list (name, invoked names) can be checked
 * without importing a line of Reticle's TypeScript.
 */
export function typecheckComposite(
  documents: readonly CompositeDocument[],
  entry: string,
): FlowTypeError[] {
  const byName = new Map(documents.map((d) => [d.name, d]));
  const errors: FlowTypeError[] = [];
  const done = new Set<string>();
  const path: string[] = [];

  const walk = (name: string, step: number): void => {
    if (path.includes(name)) {
      errors.push({
        step,
        kind: TypeErrorKind.CYCLIC_INVOCATION,
        detail: `invocation returns to a document already running: ${[...path, name].join(' → ')}`,
      });
      return;
    }
    const doc = byName.get(name);
    if (doc === undefined) {
      errors.push({
        step,
        kind: TypeErrorKind.UNRESOLVED_FLOW,
        detail: `no document named "${name}"; the set holds: ${[...byName.keys()].join(', ') || '(nothing)'}`,
      });
      return;
    }
    if (done.has(name)) return; // reuse, not recursion
    path.push(name);
    doc.steps.forEach((s, index) => {
      if (s.invoke !== undefined) walk(s.invoke, index);
    });
    path.pop();
    done.add(name);
  };

  walk(entry, 0);
  return errors;
}
