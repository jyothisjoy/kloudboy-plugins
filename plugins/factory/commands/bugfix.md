---
description: Fix a bug with the factory — diagnose, approve, reproduce with a failing test, fix, verify, review
argument-hint: [--skip tester,reviewer] <bug report or path to one>
---
You are the factory orchestrator. Fix this bug:

$ARGUMENTS

You coordinate; the factory agents do the work. Agents start with no context, so every brief you write must name the files they need. Handoffs happen through files only.

Agents: for each agent below, if the project has `.claude/agents/<name>.md`, use agent `<name>` (the project's override); otherwise use `factory:<name>`. Run every agent in the foreground and wait for it to finish; never run two factory agents at the same time — the gates check one handoff at a time.

Skipped agents: if the arguments start with `--skip <list>`, the comma list names agents this run does not use; the rest is the bug report. Only `tester` and `reviewer` can be skipped here. If the list names any other agent, stop and say which ones can be skipped. A skipped agent's steps below are left out; gates are never skipped.

## 0. Preflight
- No `.factory/config.yml` → stop and tell the user to run `/factory:init`.
- If a factory message at session start said `factory_version` doesn't match the installed plugin, repeat it and ask before continuing.
- If the bug report is a file path, read it. If it doesn't say what happens and what should happen instead, ask before continuing.
- `git status`: if there are uncommitted changes, ask before continuing.
- Note the current branch as the base. Create and switch to `factory/fix-<short-bug-slug>`.
- Write `.factory/state/run.json`: `{"kind": "bugfix", "title": "Fix: <bug title>", "base": "<base branch>", "branch": "<run branch>", "started": "<ISO time>", "skip": [<skipped agents>]}`.

## 1. Diagnose
- Brief the `planner` agent: it is a bug report, not a feature spec; give it the report. It finds the root cause and writes `.factory/plan.md` with a "Reproduce and fix" task.
- Show the root cause, the planned regression test, the tasks and any questions.
- If `approval.plan` is `required`, stop here and wait for the user to approve or correct the diagnosis. Do not continue until they say so. Re-diagnose if asked.

## 2. Reproduce and fix, task by task
For each unticked task in `.factory/plan.md`, in order:
1. Brief the `debugger` agent in bug-fix mode: task number, plan path, config path. It writes the failing regression test first, then fixes the cause.
2. If the debugger reports that the bug did not reproduce as diagnosed, stop the run and report what it found.
3. Read `.factory/state/last-verify.json`. If `gaveUp` is true, stop the run and report the task, the command, the debugger's findings and the failure output. Do not continue to later tasks.
4. Unless the tester is skipped, brief the `tester` agent: same task, focus on edge cases around the fix. Read `.factory/state/last-verify.json` again and stop the same way on a give-up.
5. `ok: true` → commit on the run branch: `factory: fix — <task title>`.

## 3. Review
- Unless the reviewer is skipped, brief the `reviewer` agent with the base branch name. It writes `.factory/review.md`.
- Any Blocking item → brief the `debugger` with the Blocking items only, then commit and review again. At most `gates.max_review_loops` loops; after that, stop and report what is still blocking.

## 4. Finish
- Commit `.factory/plan.md` and `.factory/review.md` (if written) on the run branch.
- Add `"finished": "<ISO time>"` to `.factory/state/run.json`. Do this only here, not when the run stops early.
- Report: branch name, root cause, the regression test, files changed, verify result, review verdict, skipped agents, anything unresolved.
- Never push, merge, deploy or delete branches. The human merges.
