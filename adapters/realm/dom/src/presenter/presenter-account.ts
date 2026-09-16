/**
 * Whether this machine is signed in, said the same way in every panel that shows it.
 *
 * One builder rather than three, because the interesting part is not the markup — it is the RULE,
 * and a rule copied into three panels is a rule that will be right in two of them.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────────────────────
 * THREE states, not two. `signedIn: true`, `signedIn: false`, and ABSENT — which means UNKNOWN and
 * renders nothing at all. An older daemon sends no `account` field, and a panel that read absence as
 * "signed out" would show a paying user a Sign in button on every panel they open. That is the kind
 * of nag that gets a dev-only HUD switched off for good, and switching it off costs them every
 * verdict, not just the button. `core/src/artifacts/impact.ts` states this where the field is
 * declared; this is where it has to be obeyed.
 *
 * ── NO IDENTITY BEYOND THE ORG ──────────────────────────────────────────────────────────────────
 * The avatar is built from `org`, because `org` is all there is. `AccountState` carries
 * `{ signedIn, org?, host? }` and deliberately no name, no email and no token: it is pushed into the
 * DOM of the user's own app, where anything else running on that page can read it. Initials of a
 * PERSON would mean putting a person's name there, and a nicer avatar is not worth adding the first
 * leakable field to a payload that currently has none.
 *
 * ── WHY SIGN IN IS NOT A BUTTON THAT SIGNS YOU IN ───────────────────────────────────────────────
 * A page cannot run a CLI, and signing in is a device flow in a terminal. So the control copies
 * `reticle login` rather than pretending to start something. A button that quietly does nothing is
 * worse than a line of text, because the person waits for it.
 */

import type { AccountState } from '@reticlehq/core';
import { hiIconHtml, PRESENTER_ICON_SIZE, PresenterIcon } from './icons/presenter-icons.js';
import { esc, isSafeDashboardUrl } from './chrome/presenter-safe-html.js';

/** Behaviour hooks. Attributes rather than classes: a class is styling, these are wiring. */
export const ACCOUNT_ROOT_ATTR = 'data-reticle-account';
export const ACCOUNT_SIGNIN_ATTR = 'data-reticle-account-signin';
export const SYNC_BTN_ATTR = 'data-reticle-sync-now';

export const ACCOUNT_TEXT = {
  SIGNED_OUT: 'Sign in',
  SIGNIN_TITLE: 'Run `reticle login` in your terminal — click to copy the command',
  SIGNIN_COMMAND: 'reticle login',
  DASHBOARD_TITLE: 'Open this project on the dashboard',
  /** "Now", not "sync" — the timer already syncs, this only stops somebody wondering when. */
  SYNC_TITLE: 'Push to the dashboard now, instead of waiting for the next sync',
  COPIED: 'Copied',
  /** Shown as the avatar when signed in to an org with no printable name. */
  AVATAR_FALLBACK: '•',
} as const;

/**
 * One or two letters for the avatar.
 *
 * Two words give two initials, one word gives one letter, and anything with no printable character
 * falls back to a dot — an avatar with no glyph reads as a broken image, which is worse than a plain
 * one. Upper-cased because an avatar is a mark, not a quotation.
 */
export function accountInitials(org: string | undefined): string {
  const words = (org ?? '')
    .trim()
    .split(/[\s._-]+/)
    .filter((word) => word.length > 0);
  const letters = words
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('');
  return letters.length > 0 ? letters.toUpperCase() : ACCOUNT_TEXT.AVATAR_FALLBACK;
}

/**
 * The capsule: an avatar when signed in, a Sign in control when signed out, nothing when unknown.
 *
 * `dashboardUrl` adds the way through when the project is also LINKED. Signed in and unlinked is a
 * real and common state — an account with a repo nobody has run `reticle link` in — and it gets the
 * avatar without a link rather than a link that 404s.
 */
export function accountCapsuleHtml(
  account: AccountState | undefined,
  dashboardUrl?: string,
  /**
   * Whether this surface may ASK somebody to sign in, rather than only show that they have.
   *
   * Off by default, and the default is the point. The report panel already tells an unlinked user
   * where their record stops, once, and only once a verdict has made that worth saying — its own
   * tests call a second mention in the same panel "where a line becomes a nag", and a nag in a
   * verification tool costs more trust than the conversion is worth. A capsule that offered Sign in
   * there broke both rules at once: it said the command a second time, and it said it before there
   * was any record to keep.
   *
   * Persistent chrome is the exception, and why this is a parameter rather than a deletion. The
   * workspace capsule sits in the toolbar as a STATUS, the way an account avatar does everywhere
   * else; showing signed-out there is answering a question the user can see, not interrupting them.
   */
  offerSignIn = false,
): string {
  if (account === undefined) return '';
  if (!account.signedIn) {
    if (!offerSignIn) return '';
    return `<div class="reticle-account" ${ACCOUNT_ROOT_ATTR}><button type="button" class="reticle-account-signin" ${ACCOUNT_SIGNIN_ATTR} title="${ACCOUNT_TEXT.SIGNIN_TITLE}" aria-label="${ACCOUNT_TEXT.SIGNIN_TITLE}">${ACCOUNT_TEXT.SIGNED_OUT}</button></div>`;
  }
  const org = account.org ?? '';
  const initials = accountInitials(account.org);
  // The org's name is the avatar's accessible label: a screen reader announcing "AC" has said
  // nothing, and the two letters exist only because a circle needs something drawn in it.
  const label = org.length > 0 ? esc(org) : ACCOUNT_TEXT.SIGNED_OUT;
  const avatar = `<span class="reticle-account-avatar" role="img" aria-label="${label}" title="${label}">${esc(initials)}</span>`;
  const link =
    dashboardUrl !== undefined && isSafeDashboardUrl(dashboardUrl)
      ? `<a class="reticle-account-dashboard" href="${esc(dashboardUrl)}" target="_blank" rel="noreferrer noopener" title="${ACCOUNT_TEXT.DASHBOARD_TITLE}" aria-label="${ACCOUNT_TEXT.DASHBOARD_TITLE}">${hiIconHtml(PresenterIcon.VIEW, PRESENTER_ICON_SIZE.HELP)}</a>`
      : '';
  return `<div class="reticle-account" ${ACCOUNT_ROOT_ATTR}>${avatar}${link}</div>`;
}

/**
 * The sync button, for a panel that shows a record worth pushing.
 *
 * Only when LINKED. Unlinked there is nowhere to push, and a button that reports success having
 * sent nothing is the false green this product exists to refuse — in miniature, on its own HUD.
 */
export function syncButtonHtml(dashboardUrl: string | undefined): string {
  if (dashboardUrl === undefined || !isSafeDashboardUrl(dashboardUrl)) return '';
  return `<button type="button" class="reticle-sync-now" ${SYNC_BTN_ATTR} title="${ACCOUNT_TEXT.SYNC_TITLE}" aria-label="${ACCOUNT_TEXT.SYNC_TITLE}">${hiIconHtml(PresenterIcon.SYNC, PRESENTER_ICON_SIZE.HELP)}</button>`;
}
