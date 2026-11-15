# Supply chain, CI and deployment

Use when the repo contains dependency manifests and lockfiles, CI workflows, Dockerfiles,
infrastructure as code, cloud role definitions, or a plugin/extension system. Many deciding facts
here live in the hosting account, not the repo: use Needs validation for those.

## Dependencies
- **Known-vulnerable packages**: run the stack's audit tool if installed (no login, no install);
  report only vulnerabilities in code paths the project actually uses, with the package, version
  and fixed version.
- **Lockfile gaps**: no lockfile, or install commands that ignore it (`npm install` instead of
  `npm ci` in CI); dependencies from git URLs or branches instead of versions.
- **Namespace confusion**: private package names that could resolve from the public registry
  (no scoped registry or `.npmrc`/`pip.conf` pinning).
- **Install scripts**: `postinstall` and similar scripts from dependencies run in CI with secrets
  available.

## CI workflows
- **Untrusted code with secrets**: workflows triggered by pull requests from forks
  (`pull_request_target`, `workflow_run`) that check out and run the PR's code with secrets or a
  write token.
- **Expression injection**: issue titles, branch names, PR bodies or commit messages interpolated
  into `run:` scripts (`${{ github.event.issue.title }}`).
- **Over-broad tokens**: `permissions: write-all` or default write tokens where read is enough;
  long-lived cloud keys stored as secrets instead of short-lived OIDC credentials.
- **Unpinned actions**: third-party actions referenced by mutable tag in workflows that hold
  secrets.
- **Shared caches and artifacts**: caches or artifacts written by untrusted jobs and read by
  release jobs.

## Build and release
- **Build context**: Docker images that copy the whole repo (`COPY . .`) including `.env`, keys
  or `.git`; no `.dockerignore`.
- **Secrets in images**: secrets passed as build args or baked into layers.
- **Release integrity**: releases or deploys anyone with push access can trigger from any branch;
  artifacts not tied to the reviewed commit.

## Cloud and runtime configuration
- **Broad roles**: IAM policies with `*` actions or resources for an app that needs a few;
  service-role database keys used in request paths that should use the user's permissions.
- **Public exposure**: storage buckets, databases, admin panels or debug ports public in IaC
  without need.
- **Metadata reachability**: app code that fetches user-supplied URLs on hosts where the cloud
  metadata service is reachable (pairs with SSRF).
- **Containers**: running as root, privileged mode, host mounts, Docker socket mounted.
- **Environment trust**: authorisation decided from headers a proxy is assumed to set, with no
  config ensuring the app is only reachable through that proxy.
- **Fail-open config**: missing env vars that disable auth, verification or TLS checks instead of
  stopping startup.

## Plugins and extensions
- Plugins loaded from user-writable locations or URLs; plugin code running with full app
  privileges where the design promises less.

## Validation before reporting
Name who can trigger it (fork contributor, any user, any tenant) and what they gain (a secret, a
release, a write token, access to a resource). If it depends on account settings outside the repo,
use Needs validation.
