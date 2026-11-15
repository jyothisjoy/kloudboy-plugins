# Client side and browser

Use when the browser makes trust decisions or renders untrusted data: single-page apps, browser
extensions, webviews, service workers, offline apps, `postMessage`, browser storage.

## Discipline
- A finding needs a source the attacker controls and a sink that executes or discloses. Name both.
- The impact must reach another user's session, another origin, or shared storage. Injecting into
  your own page or reading your own data is not a finding.
- Framework escaping, same-origin policy, CSP, COOP/CORP and `noopener` defaults are real controls.
  Verify them before assigning impact. Deployed headers outside the repo → Needs validation.

## DOM and object state
- **DOM XSS**: `location`, `document.referrer`, `window.name`, message data or storage reaching
  `innerHTML`, `outerHTML`, `document.write`, `eval`-like APIs, `javascript:` URLs, jQuery HTML
  methods, or framework escape hatches (`dangerouslySetInnerHTML`, `v-html`, `[innerHTML]`,
  `{@html}`). Framework-escaped interpolation is fine.
- **Stored XSS through rich text or Markdown**: user content rendered as HTML without a sanitiser,
  or with a sanitiser configured to allow scripts, event handlers or `javascript:` links.
- **Prototype pollution**: user-controlled keys in deep merge or path-set helpers, *and* a later
  read of the polluted property that changes auth, navigation, rendering or execution.
- **DOM clobbering**: injected `id`/`name` attributes that shadow a global the code trusts.

## Cross-origin
- **`postMessage`**: handlers that act on `event.data` without an exact origin allowlist (substring,
  `startsWith` or unanchored regex checks don't count); sensitive data posted to `*`.
- **Credentialed CORS**: the server reflects or loosely matches `Origin` with credentials allowed
  and returns private data.
- **WebSocket**: upgrades accepted with ambient cookies from any origin.

## Storage and service workers
- Tokens or private data in `localStorage`, IndexedDB or caches that survive logout or account
  switch and are read by another account, or by less-trusted same-origin code.
- Service workers that cache personalised responses without the user in the cache key, or whose
  script or imports an attacker can influence.

## Navigation and UI
- Client-controlled redirects without a scheme and destination allowlist (`javascript:`, `data:`,
  other hosts).
- Sensitive state-changing pages that can be framed (no `frame-ancestors`/`X-Frame-Options`) and
  completed by clicks (clickjacking). Missing frame headers on read-only pages are Notes.
- Links opened with `window.open` or `target=_blank` while code keeps `window.opener` deliberately.

## Validation before reporting
Cite the source, sink, the browser control that should stop it, and the affected user or origin.
For prototype pollution prove both the write and the gadget; for storage prove another account
or later session reads it.
