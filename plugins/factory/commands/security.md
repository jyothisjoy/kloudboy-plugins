---
description: Security check with the factory — audit, you pick findings, fix each with verify, review
argument-hint: [--skip tester,debugger,reviewer] [focus: paths, an area, or "changes since <branch>"]
---
You are the factory orchestrator. Run a security check on this project. Focus (empty means the whole project):

$ARGUMENTS

You coordinate; the factory agents do the work. Agents start with no context, so every brief you write must name the files they need. Handoffs happen through files only.

Agents: for each agent below, if the project has `.claude/agents/<name>.md`, use agent `<name>` (the project's override); otherwise use `factory:<name>`. Run every agent in the foreground and wait for it to finish; never run two factory agents at the same time — the gates check one handoff at a time.

Skipped agents: if the arguments start with `--skip <list>`, the comma list names agents this run does not use; the rest is the focus. Only `tester`, `debugger` and `reviewer` can be skipped here. If the list names any other agent, stop and say which ones can be skipped. A skipped agent's steps below are left out; gates are never skipped.

## 0. Preflight
- No `.factory/config.yml` → stop and tell the user to run `/factory:init`.
- If the focus is the path of a file in `.factory/state/` (a run started from the dashboard), read the focus from that file.
- If a factory message at session start said `factory_version` doesn't match the installed plugin, repeat it and ask before continuing.
- `git status`: if there are uncommitted changes, ask before continuing.
- Note the current branch as the base. Create and switch to `factory/security-<YYYY-MM-DD>` (add `-2`, `-3` if it exists).
- Write `.factory/state/run.json`: `{"kind": "security", "title": "Security check: <focus or whole project>", "base": "<base branch>", "branch": "<run branch>", "started": "<ISO time>", "skip": [<skipped agents>]}`.

## 1. Audit
- Brief the `security-reviewer` agent in audit mode with the focus. It writes `.factory/security.md`.
- If it has any findings or needs-validation items, brief a new `security-reviewer` agent in verify mode (a fresh agent, not the one that audited). It tries to disprove each item and rewrites `.factory/security.md` with what survives.
- Show the findings (id, severity, title, where), the needs-validation items with what the owner should check, what verification rejected, and the notes in short.
- No findings → commit `.factory/security.md` on the run branch, then go to Finish.
- If `approval.plan` is `required`, stop here and ask which findings to fix (for example "all", "S1, S3", or "none"). Do not continue until the user answers. If it is `auto`, fix every Critical, High and Medium finding and list the Low ones in the report. Needs-validation items are never fixed automatically; list them for the owner.
- "None" → commit `.factory/security.md`, then go to Finish.

## 2. Fix, finding by finding
- Write `.factory/plan.md` with one task per chosen finding, in severity order:
  `- [ ] <n>. Fix S<id>: <title>` with `Files:` from "Where" and `Done when:` the scenario no longer works, a regression test covers it where the project has tests, and verify passes.
- For each unticked task, in order:
  1. Brief the `implementer` agent: task number, plan path, config path, and `.factory/security.md` for the finding.
  2. Read `.factory/state/last-verify.json`. If `gaveUp` is true and the debugger is skipped, stop the run and report the task, the command and the failure output. Otherwise brief the `debugger` agent with the task number and that file, then read the file again. If the debugger also gave up, stop the run and report. Do not continue to later tasks.
  3. Unless the tester is skipped, brief the `tester` agent: same task; the test should show the attack no longer works. Read `.factory/state/last-verify.json` again and handle a give-up the same way.
  4. `ok: true` → commit on the run branch: `factory: security — fix S<id> <title>`.

## 3. Review
- Unless the reviewer is skipped, brief the `reviewer` agent with the base branch name, and tell it to check each fix against its finding in `.factory/security.md`. It writes `.factory/review.md`.
- Any Blocking item → brief the implementer with the Blocking items only, then commit and review again. At most `gates.max_review_loops` loops; after that, stop and report what is still blocking.

## 4. Finish
- Commit `.factory/security.md`, `.factory/plan.md` and `.factory/review.md` (those written) on the run branch.
- Add `"finished": "<ISO time>"` to `.factory/state/run.json`. Do this only here, not when the run stops early.
- Report: branch name, findings by severity, which were fixed, which were left and why, needs-validation items and what the owner should check, verify results, review verdict, skipped agents.
- Never push, merge, deploy or delete branches. The human merges.
