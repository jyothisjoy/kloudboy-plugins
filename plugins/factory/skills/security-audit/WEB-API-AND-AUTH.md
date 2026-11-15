# Web, API and authentication

Use with ATTACK-CLASSES.md when the project serves HTTP or handles identity. Access control asks
whether a principal may do something; this file asks whether the HTTP or identity layer can be
confused about *which* principal, request, token or assurance level an operation belongs to.

## Discipline
- For every credential (session, JWT, API key, OAuth code, reset token, MFA challenge), find
  where it is verified and every binding it needs: issuer, audience, user, session, resource,
  expiry, one-time use.
- `Host`, `X-Forwarded-*`, `Origin`, `Referer`, redirect targets and callback state are trust
  decisions. Trace each to what it changes.
- A missing header, cookie flag, MFA prompt or rate limit alone is a Note. A finding needs an
  accepted invalid request, cross-user impact, an assurance downgrade or a disclosed credential.
- Proxy, CDN, IdP and hosting settings are often outside the repo: use Needs validation.

## HTTP handling
- **Host and forwarded headers** used to build reset links, callback URLs, tenant routing or the
  client IP for rate limits, without a trusted-proxy setting that strips client copies.
- **Response header injection**: input in `Location`, `Set-Cookie` or other headers; check whether
  the framework rejects CR/LF first.
- **Caching**: responses that vary by user or auth but are cacheable publicly; cache keys missing a
  header or cookie that changes the response; private pages matched by static-file cache rules.
- **Request parsing**: custom parsers or proxies that disagree on body length or header names
  (request smuggling) — only where the repo contains such a component.

## Browser sessions
- **CSRF**: cookie-authenticated state changes that accept cross-site requests without a token,
  strict `SameSite`, or an `Origin` check. Include JSON, multipart, method-override and legacy
  routes. Read-only routes and bearer-token APIs don't qualify.
- **Session lifecycle**: session ID not rotated at login, privilege change or impersonation; still
  valid after logout, password change, account disable.
- **Cookie scope**: over-broad `Domain`/`Path` that lets a less-trusted subdomain read or replace a
  session cookie.

## Tokens and federated login
- **JWT**: signature really verified (not just decoded); algorithm pinned on the server, so `none`
  and RS256-to-HS256 confusion (the public key used as an HMAC secret) are refused; key chosen by
  the server, not by `kid`/`jku`/`x5u`/an embedded `jwk` from the token; HMAC secret long and not a
  default; `exp`, `nbf`, `aud`, `iss` and token type checked. A token for another service is invalid
  here.
- **OAuth/OIDC**: `state` bound to the session; PKCE where applicable; exact `redirect_uri` match
  if this app is the authorisation server; ID token issuer, audience, signature and nonce checked;
  in multi-provider login, the provider bound to the callback.
- **SAML**: the signed element is the one used for identity; no unsigned fallback; XML parser safe;
  audience, recipient and validity window checked; replay prevented.

## Strong authentication and recovery
- **MFA**: enrolling, replacing or disabling a factor needs fresh authentication; disabled factors
  stop working; alternate login routes don't skip the second factor.
- **Step-up**: the challenge is bound to the user, session, action and expiry.
- **Password reset and email/phone change**: unpredictable single-use tokens bound to user and
  purpose, short expiry, old tokens and sessions invalidated, reset link host not taken from the
  request.
- **Account linking**: adding a login method or email needs a current session and proof of the new
  identity; watch for verified-email collisions across providers or tenants.

## API keys
- A key works for more tenants, resources or actions than its record grants, or request
  parameters override its scope.
- Secret keys in client bundles, URLs, logs or responses; publishable and secret keys confused.
- Revoked keys still accepted because of caches.

## API-specific checks
- **Object-level authorisation**: every handler that takes an ID checks ownership or membership.
- **Property-level authorisation**: responses that return more fields than the caller may see
  (password hashes, internal flags, other users' emails); writes that accept fields the caller may
  not set (mass assignment).
- **Function-level authorisation**: admin or internal operations reachable with a normal token,
  including old API versions and routes not used by the UI.
- **Resource limits**: unbounded page size, result count, upload size, batch length, nesting depth,
  or expensive filters on endpoints any user can call.
- **GraphQL**: per-field and per-resolver authorisation (not only per query), introspection and
  debug in production, query depth and complexity limits, batching that bypasses rate limits.
- **WebSockets**: the upgrade checks `Origin` or a token (not only an ambient cookie); every
  message handler re-checks authorisation for the resource it touches.
- **Third-party APIs**: responses and webhooks from other services treated as trusted; webhook
  signatures not verified, or verified after parsing and acting; outbound calls that forward user
  credentials to the wrong host.
- **Inventory drift**: old versions, debug endpoints or staging routes still registered, with
  weaker checks than the current API.

## Validation before reporting
1. Cite the verification line and the missing binding, and show that the server accepts the invalid
   token, request or transition.
2. For CSRF, name the cookie, the state-changing route, the accepted cross-site request and the
   missing check.
3. Check framework and library defaults (many frameworks enable CSRF tokens, escape output,
   verify JWT `exp`). If the version or configuration is unknown, use Needs validation.
