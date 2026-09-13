import { AnchorKind, type FlowStep } from '@reticlehq/core';
import { affectedFlows, type AffectedResult, type FlowSources } from './affected.js';

/**
 * A flow's sources manifest, DERIVED from its already-persisted step anchors — no separate storage. A
 * COMPONENT anchor carries the source file its element was stamped from (via the babel/next plugin);
 * collecting those files, recursively through act_sequence sub-steps, gives the set of files whose change
 * should re-verify this flow. A flow with no stamped sources yields an empty manifest → unknown
 * provenance → always affected (fail-safe), handled by affectedFlows.
 */
export function flowSources(steps: readonly FlowStep[]): string[] {
  const files = new Set<string>();
  const walk = (list: readonly FlowStep[]): void => {
    for (const step of list) {
      const anchor = step.anchor;
      if (anchor.kind === AnchorKind.COMPONENT && anchor.source !== undefined) {
        files.add(anchor.source.file);
      }
      /*
       * The step's own source, which is where almost every real flow's coverage actually lives.
       *
       * Only a COMPONENT anchor had somewhere to put one, and a recorder prefers a TESTID anchor
       * whenever the element has a testid — so the flows most likely to exist were exactly the ones
       * that could never say what they cover. Every one came back unknown-provenance and the
       * fail-safe re-ran the lot: measured against this repo's own saved flows, 52 replayed in 46
       * seconds to answer `unknown`.
       */
      if (step.source !== undefined) files.add(step.source.file);
      if (step.steps !== undefined) walk(step.steps);
    }
  };
  walk(steps);
  return [...files];
}

/** A saved flow, minimally: its name and steps. */
export interface NamedFlow {
  name: string;
  steps: readonly FlowStep[];
}

/** Map saved flows to the {name, sources} the affected index consumes, deriving each manifest. */
export function toFlowSources(flows: readonly NamedFlow[]): FlowSources[] {
  return flows.map((flow) => ({ name: flow.name, sources: flowSources(flow.steps) }));
}

/** Which saved flows a set of changed files affects — the derivation + index in one call. */
export function affectedSavedFlows(
  flows: readonly NamedFlow[],
  changedFiles: readonly string[],
): AffectedResult {
  return affectedFlows(toFlowSources(flows), changedFiles);
}
