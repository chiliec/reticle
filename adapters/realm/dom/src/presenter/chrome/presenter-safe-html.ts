/**
 * The two rules every panel that builds HTML from outside text has to obey.
 *
 * Extracted from `presenter-report.ts` when a second panel needed them. Not for tidiness: both are
 * SECURITY rules with an incident behind them, and a security rule copied into a second file is a
 * rule that will be fixed in one of them. The report panel was the only caller for as long as it was
 * the only panel rendering app-derived text; it stopped being that, and the right response to a
 * second caller is one implementation rather than two.
 */

/**
 * Escape text that came from outside this panel.
 *
 * A defect's `detail` is ultimately the CONTENT of somebody else's page, and these panels build
 * their DOM from an HTML string. Everything else they render is a number or a date; app-derived
 * text is where escaping has to arrive with the feature.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Whether a dashboard link is safe to render as a clickable href.
 *
 * The url arrives from `.reticle/cloud.json` — a file in somebody's repository, which means it is
 * INPUT. Escaping the quotes stops it breaking out of the attribute but does nothing about the
 * SCHEME, so `javascript:...` produced a link that ran code inside the developer's own application,
 * from a panel Reticle injected there. Only the two schemes a dashboard can actually live on are
 * allowed; anything else renders no link at all, which is the same state as an unlinked project and
 * therefore already a supported one.
 */
export function isSafeDashboardUrl(raw: string): boolean {
  try {
    const scheme = new URL(raw).protocol;
    return 'https:' === scheme || 'http:' === scheme;
  } catch {
    // Not a url at all. A relative path cannot address a dashboard on another origin, so there is
    // nothing to render and nothing lost by refusing it.
    return false;
  }
}
