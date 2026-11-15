# Core attack classes

Use every class that the map supports. Each class says what to trace in source; the method,
evidence bar and report format are in SKILL.md. A flag is not a finding: trace the impact first.

## Injection
Trace untrusted input from its entry point to a dangerous sink:
- **Web and services**: SQL/NoSQL queries built by string concatenation or raw-query escape
  hatches (`$queryRawUnsafe`, `whereRaw`, `$wpdb->query` without `prepare`), dynamic table,
  column or sort names without an allowlist (parameters can't bind identifiers), NoSQL queries that
  accept operator objects from the body (`$ne`, `$gt`, `$where`) where a string was expected, HTML
  output that skips
  the framework's escaping, template engines rendering user strings as templates (SSTI), LDAP/XPath,
  redirects, log lines and headers.
- **Commands**: `exec`, `system`, `shell=True`, backticks, `child_process.exec`, any shell string
  that includes input. Argument arrays without a shell are the safe pattern.
- **Files and paths**: input joined into a path without resolving it and checking it stays under
  the intended folder.
- **Code evaluation**: `eval`, `Function`, `vm`, dynamic `import()`/`require()`, `unserialize`,
  `pickle`, YAML loaders that build objects, XML parsers with external entities enabled (XXE).
- **Indirect**: data stored safely, later read by other code and used in a dangerous context
  (second-order). Injection through field names, keys, sort/filter parameters and headers, not
  only values.

## Access control
Don't stop at "a check exists"; check it is the right check, on the right resource, by the right
mechanism:
- Routes that require login but never check that the record belongs to the caller (IDOR).
- A second path to the same change (bulk, export/import, admin tool, legacy route, GraphQL
  mutation, server action) with a weaker check.
- Request fields that override what the server should decide: `role`, `ownerId`, `tenantId`,
  `isAdmin`, `price` (mass assignment).
- Checks done in the UI or middleware only, while the API handler trusts the caller.
- Per-item permission in batch and list operations.

## Files, URLs and resources
- **Path traversal** through `..`, encoded sequences, absolute paths, symlinks and archive entries
  (zip slip). The fix resolves the real path and checks the prefix.
- **SSRF**: the server fetches a URL the user influences (webhooks, image proxies, import-from-URL,
  previews). Check redirects, internal hosts (`localhost`, `169.254.169.254`, private ranges) and
  URL parser differences.
- **File upload**: type checked by name or client MIME only (not content), files saved under the
  web root or served back inline with an executable or HTML/SVG type instead of
  `Content-Disposition: attachment`, original filenames used as paths, no size limit, and
  processing steps (image resize, PDF, archive extraction, office parsing) that hand untrusted files
  to a powerful library.
- **Deserialisation**: native deserialisers (`unserialize`, `pickle`, Java/.NET serialisers,
  `yaml.load`) fed from cookies, queues, caches or request bodies without signing or a type
  allowlist.
- **Temp files and races**: predictable temp names, check-then-use gaps on files.

## Secrets and cryptography
- Keys, tokens and passwords in source, config, tests, seed data, client bundles, logs, error
  messages or URLs. Look in git history too: a removed secret is still exposed.
- Weak randomness (`Math.random`, `rand()`) for tokens, reset links, IDs that grant access.
- Secret comparison with `==` where timing matters; home-made crypto; ECB, static IVs,
  unauthenticated encryption; signatures decoded but not verified.
- Error paths that fall back to no verification.

## Business logic
Hunt by hand; scanners miss these:
- **State machines**: skipping steps (pay → ship), replaying a completed step, going backwards,
  partial failure that leaves step 1 done without step 2.
- **Races**: check-then-act without a transaction or lock — double spend, coupon reused, two
  approvals, stock below zero. Look for read, compare, write sequences on shared records.
- **Numbers**: negative or zero quantities, overflow, rounding, string-to-number coercion,
  currency mixing.
- **Trust in stored data**: values assumed safe because they were validated on another path.
- **Time**: expiry checks at boundaries, time zones, clocks, rate windows.
- **Defaults**: what happens when config is missing, a feature flag is off or a dependency is down.
  Fail-open is a finding when it opens a real boundary.

## Feature abuse and data leakage
- Export or backup that includes data above the caller's access, other users' data or deleted data.
- Import or restore that overwrites records or skips validation the UI enforces.
- Search, filter or sort that reveals hidden records or fields (an oracle).
- Error messages, status codes or timing that enumerate accounts or private objects, where that
  enumeration matters.
- Preview and draft links that unlock more than one item.
- User-set webhook or callback URLs fetched by the server (see SSRF).

## Chained and second-order issues
- Component A validates, component B assumes something stronger (length, encoding, tenant).
- Safe data becomes dangerous later: a slug becomes a path, escaped text is rendered raw, a stored
  string becomes a URL, regex or query.
- Capabilities that grow after refresh, role change, delegation or caching.
- Restore, undelete and rollback that skip current ownership checks.
Confirm each link; don't assume the next step works.

## Wildcard
Read what looks boring or half-finished: experimental features, compatibility shims, `legacy`,
`temp`, `hack` code, comments that explain why something is safe (check the explanation). Ask what
the API allows that the UI never sends, and which features combine badly (import + webhooks,
preview + cache, impersonation + API keys). Compare tests with the code: which edge cases have no
test?

## Obvious things (check every item, literally)
- Hard-coded passwords, API keys, tokens, private keys (`password`, `secret`, `apikey`, `token`,
  `Bearer`, `-----BEGIN`); committed `.env`, `*.pem`, `*.key`, `credentials.json`.
- `.gitignore` covering secrets, uploads and local config.
- `TODO`/`FIXME`/`HACK` comments about auth, validation or permissions.
- Debug or dev mode that can be switched on in production by env, query parameter or header.
- Seed, demo or test accounts that would work in production.
- Unprotected `/debug`, `/admin`, `/test`, `/metrics`, `/env`, `/config`, `/health` routes that
  expose data or actions.
- `eval`, `exec`, `child_process`, `Function`, `unserialize` with dynamic input.
- CORS reflecting the request origin with credentials; cookies with session data missing
  `HttpOnly`/`Secure`/`SameSite`; open redirects on `next`, `return`, `redirect`, `url`.
- Stack traces, SQL errors or internal paths in production error responses.
- Known-vulnerable dependencies that the code actually reaches (lockfile + audit tool).

For each hit, verify the full path before reporting: is the cookie sensitive, is the route
reachable without auth, is the secret real and live-looking (not an example placeholder)?
