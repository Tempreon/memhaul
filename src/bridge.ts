/**
 * The one honest bridge from the local tool to the hosted product.
 *
 * memhaul is a standalone, local tool: `parse` and `audit` never touch the
 * network and the files it writes are the user's. This module is the ONLY place
 * that mentions Tempreon, and it is a plain invitation to a web flow — never a
 * claim of a one-click import and never an implication that the CLI pushes
 * anything itself. The real flow (sign up → connect an MCP bridge in your own
 * Claude/ChatGPT → import) is not one-click, so the copy must not pretend it is.
 * See docs/adr/0003-tempreon-push-auth.md.
 */

// Canonical apex domain. (app.tempreon.com now 308-redirects here, so never
// link the app subdomain in public-facing copy — verified 2026-07-11.)
export const TEMPREON_URL = 'https://tempreon.com';

/** Multi-line hint printed after `parse` (unless --quiet). */
export function bridgeHint(): string {
  return (
    '\nWant this memory living across Claude and ChatGPT — read back automatically,\n' +
    'not just sitting in a folder? That is what Tempreon does. Sign up (free),\n' +
    `connect your assistant, and bring these files in: ${TEMPREON_URL}\n` +
    'memhaul itself sends nothing — the files above are yours.'
  );
}

/** One-line variant for the push dry-run output. */
export function bridgeLine(): string {
  return `Bring your memory across Claude and ChatGPT via Tempreon: ${TEMPREON_URL} (web sign-up + connect; not a one-click import).`;
}
