/**
 * The onboarding tour, once, for both surfaces that show it.
 *
 * The CLI prints it at the end of `reticle setup install`; the browser SDK renders it as a carousel
 * over the user's own running app, beside the HUD. Those are two audiences in two media, and the
 * rule that governs them is the one `tutorial.ts` already stated about its own two audiences: what
 * they MUST share is the order and the claims, because two routes through one product is how a
 * support answer stops matching what anybody actually did.
 *
 * So the steps live here, in the package both ends already depend on, and neither renderer owns
 * them. `@reticlehq/server` cannot be imported by the browser and `@reticlehq/browser` cannot be
 * imported by the server; core is the only place a shared sentence can sit without inventing an
 * edge between them.
 *
 * The sequence is not arbitrary. It ends at a VERDICT because a tour that ends at "you can see the
 * page now" has taught the least valuable half: looking is not verifying, and an agent that learns
 * only to look will report that it looked. And it declares the consequence BEFORE acting, because
 * that ordering IS the idea being taught — naming what should happen first is the difference
 * between a check and a rationalisation written afterwards.
 */

/**
 * What a slide points at when the tour is drawn over a real page.
 *
 * The HUD is addressable because Reticle put it there. The APP is addressable because the slide
 * that uses it is about the app as a WHOLE — "here is the thing being snapshotted" — which needs a
 * region, not a control. That is the line: a tour may point at the app, and may not point at a
 * button inside it, because the button would be a guess about markup we have never seen.
 *
 * It matters that the tour points at the app at least once. The pitch is verifying YOUR RUNNING
 * APP from the inside, and a tour drawn entirely over a dimmed page reads as a modal that happens
 * to sit on top of one.
 */
export const TourAnchor = {
  /** No target: the slide is prose, centred. */
  NONE: 'none',
  /** Reticle's own in-page HUD. */
  HUD: 'hud',
  /** The app's own content region — `<main>`, else the framework's mount node. */
  APP: 'app',
} as const;
export type TourAnchor = (typeof TourAnchor)[keyof typeof TourAnchor];

export interface TourStep {
  id: string;
  /** Three or four words. The carousel shows this; the terminal does not. */
  title: string;
  /** What this step is, in words. Both surfaces show this. */
  say: string;
  /** Why it is worth doing — the half that stops a tour being a list of keystrokes. */
  why: string;
  /** The exact call, for the audience that would otherwise infer it from the prose. */
  call?: string;
  /** What to highlight when drawn over a page. Ignored in a terminal. */
  anchor?: TourAnchor;
}

/**
 * The prompt the last slide hands over.
 *
 * A tour that ends with "now go and try it" ends at the point where somebody has to invent the
 * next move themselves, which is where they stop. This is the move, written out, ready to paste
 * into whichever agent they use — and it names a VERDICT as the finish line rather than a config
 * file, because that distinction is the whole product and it is the one most easily lost.
 */
export const TOUR_HANDOFF_PROMPT =
  'Use Reticle to verify this app actually works. Take a snapshot, pick one real flow a user ' +
  'cares about, decide what should be true after it BEFORE you touch anything, then drive it and ' +
  'report the verdict with the evidence that decided it. Do not tell me it works until Reticle ' +
  'says verified: yes.';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'connect',
    title: 'It is connected',
    // The ring points at the HUD, so the prose has to make the HUD the evidence. It used to say the
    // proof was a session "listed here", which is the output of the call below — a reader followed
    // the ring to the panel and the panel was not what proved the claim. The panel IS proof: it is
    // mounted only on a connected session and never appears without one.
    say: 'That panel is Reticle, live on your page. It only appears once a session has connected, so seeing it IS the proof; ask your agent for the list and it will say the same thing.',
    why: 'Having the tools is not the same as being set up. Every later answer is about a page that must already be connected.',
    call: 'reticle_sessions',
    anchor: TourAnchor.HUD,
  },
  {
    id: 'look',
    title: 'Look, without pixels',
    say: 'Take a semantic snapshot. You get the controls and their refs, not pixels, so you can point at things by name.',
    why: 'A ref is stable across snapshots, which is what lets you plan several steps before spending any of them.',
    call: 'reticle_snapshot { mode: "interactive" }',
    // The one slide that points at the app itself, and the only one where that is the subject: a
    // snapshot is OF this region. Without it the tour never once directs attention at the thing it
    // spends five slides talking about.
    anchor: TourAnchor.APP,
  },
  {
    id: 'declare',
    title: 'Say it first',
    say: 'Decide what should happen BEFORE you touch anything. "Clicking Pay makes the receipt appear" is a claim that can be wrong.',
    why: 'This is the whole idea. A consequence named first is a check; the same sentence written after the fact is a rationalisation, and it is the difference between a verdict and a story.',
    // Every other slide's block is something you can run; this one was a comment — a placeholder on
    // the most important screen in the tour. It now shows the distinction it is teaching, because
    // "name the consequence" means nothing until you see one next to a wait that proves nothing.
    call: 'until: { signal: "order:placed" }   // a consequence — not until: { ms: 500 }',
    anchor: TourAnchor.NONE,
  },
  {
    id: 'verdict',
    title: 'Act, and prove it',
    say: 'Act and prove in one call. The answer says verified yes / no / unknown, and `because` names the evidence that decided it.',
    why: 'Only `reticle_act_and_wait` and `reticle_assert` produce a verdict. A drive that ends without one has no result, however many tools it used — and "unknown" is an honest answer, not a pass.',
    call: 'reticle_act_and_wait { ref, action: "click", until: { signal: "order:placed" } }',
    anchor: TourAnchor.HUD,
  },
];
