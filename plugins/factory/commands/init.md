---
description: Set up the factory for this project — writes .factory/config.yml and a CLAUDE.md draft, then stops for review
---
Set up the software factory for the project in the current directory. Do not build any features.

1. If `.factory/config.yml` already exists, show it and ask whether to redo setup. Stop unless told yes.
2. Inspect the repo (read only):
   - Package manager from the lockfile (pnpm-lock.yaml → pnpm, yarn.lock → yarn, package-lock.json → npm, composer.lock → composer).
   - Framework and stack: Next.js + Prisma → `nextjs-prisma`; WordPress theme/plugin (style.css theme header, wp-content, functions.php) → `wordpress`; plain HTML/static generator → `static-site`. Anything else → `other`, and say so.
   - Scripts for typecheck, lint, test, build, dev (package.json scripts, composer scripts, Makefile).
   - Existing design tokens (tailwind config, tokens.css, theme.json) and a moodboard folder (`design/moodboard/`, `moodboard/`).
   - Git default branch.
   - `node -v`: Node 18+ is needed for hooks and the dashboard. If missing or older, set `dashboard.mode: off` and tell the user.
3. Write `.factory/config.yml` from the template below, filled from what you found. Leave a `# TODO` comment on anything you could not determine. `commands.verify` must be a real command; if the project has no tests, use lint/typecheck/build and set `gates.ui_check: playwright` or `manual` — never leave verify empty.
4. Add `.factory/state/` to `.gitignore` (create the file if needed; don't duplicate the line).
5. Project `.claude/settings.json` (create or merge; keep existing keys), so teammates who clone the repo are prompted to install the factory:
   - Set `"enabledPlugins": { "factory@kloudboy": true }`.
   - Read the `kloudboy` entry in `~/.claude/plugins/known_marketplaces.json`. If its `source` is `github` or `git`, set `"extraKnownMarketplaces": { "kloudboy": { "source": <that source> } }`. If it is a local `directory`, don't write a machine-local path; add a TODO asking for the marketplace's git URL instead.
6. CLAUDE.md: if none exists, draft one with the project's purpose (ask if unknown), stack, commands, conventions you can see in the code, and "ask when something isn't covered". If one exists, don't overwrite it — list suggested additions instead.
7. Show the config, settings and CLAUDE.md changes, list every TODO, and ask the user to review and commit them. Do not commit.

Template (`factory_version` is the `version` in `<plugin-root>/.claude-plugin/plugin.json`, with the plugin root read from `~/.factory/plugin-root`):

```yaml
factory_version: <installed factory version>
project: <short-kebab-name>
stack: <nextjs-prisma | wordpress | static-site | other>
commands:
  verify: <command that must pass for a task to be done>
  build: <build command or ''>
  dev: <dev server command or ''>
  fast_check: <optional quick check run on each changed file, the file path is appended, e.g. 'npx eslint'; or ''>
gates:
  verify_required: true
  verify_timeout_s: 600
  max_verify_retries: 2
  max_review_loops: 2
  ui_check: <playwright | manual | none>
protected_paths: [.env*, '**/*.pem', infra/**]
approval:
  plan: required            # required | auto
  ui_direction: required
ui:
  moodboard: <path or ''>
  design_system: <path or ''>
  lab_dir: <app/_lab/ for Next.js, or a sandbox folder>
  variants: 3
dashboard:
  mode: local               # local | team | off
  url: ''                   # team collector URL (team mode)
  autostart: false
```

For `nextjs-prisma`, also add `prisma/migrations/**` to `protected_paths`.
