# Data isolation, messaging and resource use

Use when the project stores data for several users or tenants, keeps derived copies (caches,
search, exports, logs), processes queues, webhooks or background jobs, or does expensive work on
input from untrusted callers.

## Data isolation and lifecycle
- **Missing owner or tenant filter**: a query, cache read or batch job that omits the tenant/owner
  condition the main path has. A `tenantId` column is not enforcement unless every query uses it.
- **Key collisions**: composite keys or namespaces (`user:` + id, file names, cache keys) that two
  tenants can make collide.
- **Policy vs query**: row-level policies or ORM scopes bypassed by raw queries, admin clients,
  service-role keys, or a second ORM instance.
- **Signed links and blobs**: signed URLs or object keys that grant more than one object, never
  expire, or are guessable.
- **Search, cache and index drift**: copies that keep data after permissions change, or are
  queried without the user's ACL.
- **Logs and analytics** that store personal data or secrets readable by a wider group.
- **Export, backup, import, restore**: scope wider than the caller's access; restore that brings
  back deleted data or old permissions.
- **Soft delete**: deleted records still returned by some query, search or export.
- **Stale authorisation**: decisions cached in sessions, JWT claims or caches after a role is
  removed.

## Queues, webhooks and messages
- **Incoming webhooks**: signature not verified, verified over re-serialised data instead of the
  raw body, or the action happens before verification; no replay protection where it matters.
- **Producer trust**: any service or user that can publish to a queue or topic can trigger
  privileged handlers.
- **Per-message authorisation**: handlers act on IDs from the message without checking who the
  message is for.
- **Duplicates and ordering**: no idempotency on payments, emails or credits; stale messages
  overwrite newer state.
- **Dead-letter and retry**: failed messages with personal data or secrets stored or logged
  widely.

## Resource use (availability)
Only report what one ordinary caller can trigger against shared capacity, and never test it.
- **Superlinear work**: regexes with catastrophic backtracking on user input, nested loops over
  user-sized lists, unbounded recursion.
- **Amplification**: decompression (zip bombs), image or PDF processing, XML entity expansion,
  queries that fan out per item (N+1 at user-controlled size).
- **Unbounded buffers**: whole request bodies or uploads read into memory with no limit; result
  sets without pagination.
- **Work before auth**: expensive hashing, rendering or third-party calls on unauthenticated
  routes without a limit.
- **Cost**: user-triggered calls to paid APIs (LLM, SMS, email) without quota or per-user limit.

## Validation before reporting
Name the other user or tenant who is affected and the exact query, copy or handler that crosses
the boundary. For resource issues, show the input size an ordinary caller controls and the code
that scales with it; don't estimate effects you can't trace.
