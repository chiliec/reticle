/**
 * Mounting the first-run tour. The half that touches a document.
 *
 * `tour-view.ts` decides what every slide says and which element it points at, as pure functions.
 * This puts them on a page, listens for clicks, and remembers that somebody has seen it. Split that
 * way because the presenter's hardest bugs have always been in what gets RENDERED and when — and a
 * real document is exactly the thing that hides those.
 *
 * ## Shown once, and only where it can help
 *
 * Once per project, keyed in `localStorage`. A tour that reappears on every reload is not
 * onboarding, it is a popup, and the second time somebody sees one they stop reading it.
 *
 * It also never shows while an agent is driving. Reticle's whole job in that moment is to let a
 * tool act on the page, and a modal that eats clicks would break the product to explain it.
 */

import {
  TOUR_ATTR,
  TOUR_CSS,
  TOUR_TARGET_ATTR,
  isLastSlide,
  nextIndex,
  slideHtml,
  tourSlides,
} from './tour-view.js';
import { TourAnchor } from '@reticlehq/core/tour';

/** Where "they have seen it" is remembered. Per project, so a second app still gets its tour. */
export const TOUR_SEEN_KEY_PREFIX = 'reticle.tour.seen.';

/**
 * Where the app's own content lives, in preference order.
 *
 * `<main>` first because an app that has one has said where its content is. Then the two mount
 * nodes that between them cover most of what `create-vite` and friends scaffold. `document.body`
 * is deliberately NOT a fallback: it includes the HUD and every fixed overlay, so a ring around it
 * is a ring around the whole viewport, which points at nothing by pointing at everything.
 */
const APP_SELECTORS = ['main', '#root', '#app'] as const;

/**
 * The box to ring for a slide's anchor, or undefined when there is nothing honest to ring.
 *
 * Both anchors decline the same way and for the same reason: the HUD is genuinely absent when the
 * panel is disabled, and an app with none of the selectors above is an app whose content region we
 * would be guessing at. A tour that guesses points somebody at the wrong thing with full confidence.
 */
function anchorBox(doc: Document, anchor: TourAnchor): DOMRect | undefined {
  if (TourAnchor.HUD === anchor) {
    return doc.querySelector('[data-reticle-hud]')?.getBoundingClientRect();
  }
  if (TourAnchor.APP !== anchor) return undefined;
  for (const selector of APP_SELECTORS) {
    const found = doc.querySelector(selector);
    if (null === found) continue;
    const box = found.getBoundingClientRect();
    if (box.width > 0) return box;
  }
  return undefined;
}

export const tourSeenKey = (projectId: string): string => `${TOUR_SEEN_KEY_PREFIX}${projectId}`;

/** The storage this needs. Injected, because `localStorage` throws outright in some embeddings. */
export interface TourStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface TourDeps {
  readonly document: Document;
  readonly storage: TourStorage | undefined;
  readonly projectId: string;
  /** True while a tool is acting. The tour stays away rather than eating the clicks. */
  readonly isDriving: () => boolean;
  /** Copying is a capability, not a guarantee — an insecure origin has no clipboard. */
  readonly copy?: (text: string) => void;
}

export interface TourHandle {
  readonly destroy: () => void;
  /** Visible right now. Exposed for the tests that assert it went away. */
  readonly isOpen: () => boolean;
}

/**
 * Has this person already been shown the tour here?
 *
 * Any storage failure counts as "yes". A private window, blocked site data or a thrown accessor
 * must not turn into a tour on every single load — the failure mode of showing it too often is
 * worse than the failure mode of not showing it at all.
 */
export function tourAlreadySeen(storage: TourStorage | undefined, projectId: string): boolean {
  if (undefined === storage) return true;
  try {
    return null !== storage.getItem(tourSeenKey(projectId));
  } catch {
    return true;
  }
}

function markSeen(storage: TourStorage | undefined, projectId: string): void {
  try {
    storage?.setItem(tourSeenKey(projectId), '1');
  } catch {
    /* A tour that cannot be remembered is still worth having shown once. */
  }
}

/**
 * Show the tour, unless it has been seen or an agent is mid-drive.
 *
 * Returns `undefined` when it declines, so a caller cannot accidentally treat "not shown" as a
 * live handle and then try to tear down something that was never mounted.
 */
export function mountTour(deps: TourDeps): TourHandle | undefined {
  if (deps.isDriving()) return undefined;
  if (tourAlreadySeen(deps.storage, deps.projectId)) return undefined;

  const doc = deps.document;
  const style = doc.createElement('style');
  style.setAttribute(TOUR_ATTR, '');
  style.textContent = TOUR_CSS;
  doc.head.appendChild(style);

  const root = doc.createElement('div');
  root.setAttribute(TOUR_ATTR, '');

  const slides = tourSlides();
  let index = 0;
  let open = true;

  const close = (): void => {
    if (!open) return;
    open = false;
    markSeen(deps.storage, deps.projectId);
    root.remove();
    style.remove();
  };

  const draw = (): void => {
    const slide = slides[index];
    if (undefined === slide) return;
    root.innerHTML = `<div class="reticle-tour-scrim"></div>${slideHtml(slide)}`;
    // The highlight is drawn only when the thing it points at is actually on the page. A ring
    // floating over nothing is worse than no ring: it tells somebody to look where there is
    // nothing to see, and the HUD is genuinely absent when the panel is disabled.
    if (TourAnchor.NONE !== slide.anchor) {
      const box = anchorBox(doc, slide.anchor);
      if (undefined !== box && box.width > 0) {
        // A REGION is outlined; a TARGET is spotlit. The app is the whole content area, so cutting
        // a hole for it removes the dimming entirely — the card ends up competing with a fully lit
        // page and the ring edges sit at the margins pointing at nothing. Measured by looking at it.
        const region = TourAnchor.APP === slide.anchor;
        const ring = doc.createElement('div');
        ring.className = region ? 'reticle-tour-ring is-region' : 'reticle-tour-ring';
        // Inset for a region, outset for a target: an outline reads as "all of this" when it sits
        // just inside the thing, and a spotlight needs clearance around what it lights.
        const pad = region ? -2 : 6;
        ring.style.left = `${String(Math.round(box.left - pad))}px`;
        ring.style.top = `${String(Math.round(box.top - pad))}px`;
        ring.style.width = `${String(Math.round(box.width + pad * 2))}px`;
        ring.style.height = `${String(Math.round(box.height + pad * 2))}px`;
        root.appendChild(ring);
        // The spotlight dims the page itself and leaves a hole where the target is. Leaving the
        // scrim opaque fills that hole back in, so the one element the slide points at ends up
        // dimmed like everything else — and the page takes the wash twice. Only for a spotlight: an
        // outlined region keeps its dimming, which is the entire difference between the two.
        if (!region) root.querySelector('.reticle-tour-scrim')?.classList.add('is-clear');
      }
    }
  };

  root.addEventListener('click', (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const hit = target.closest(`[${TOUR_TARGET_ATTR}]`);
    const what = hit?.getAttribute(TOUR_TARGET_ATTR);
    if (undefined === what || null === what) return;
    event.preventDefault();
    event.stopPropagation();
    if ('skip' === what || 'done' === what) {
      close();
      return;
    }
    if ('copy' === what) {
      const slide = slides[index];
      if (undefined !== slide?.prompt) deps.copy?.(slide.prompt);
      return;
    }
    const moved = nextIndex(index, 'back' === what ? -1 : 1);
    if (moved === index) return;
    index = moved;
    draw();
  });

  draw();
  doc.body.appendChild(root);

  return {
    destroy: close,
    isOpen: () => open,
  };
}

export { isLastSlide };

/**
 * `localStorage`, or nothing.
 *
 * Reading the property itself throws in a blocked-site-data browser — not the call, the ACCESS — so
 * this is a try around the getter and not around a method. Returning `undefined` makes the tour
 * treat it as already seen, which is the safe direction: never showing it beats showing it on
 * every load.
 */
export function safeLocalStorage(): TourStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
