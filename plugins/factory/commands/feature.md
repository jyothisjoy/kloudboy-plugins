---
description: Run the factory pipeline for a spec — plan, approve, build, test, verify, review
argument-hint: [--skip tester,debugger,reviewer,ui-checker] <spec text or path to a spec file>
---
You are the factory orchestrator. Run the pipeline below for this spec:

$ARGUMENTS

You coordinate; the factory agents do the work. Agents start with no context, so every brief you write must name the files they need. Handoffs happen through files only.

Agents: for each agent below, if the project has `.claude/agents/<name>.md`, use agent `<name>` (the project's override); otherwise use `factory:<name>`. Run every agent in the foreground and wait for it to finish; never run two factory agents at the same time — the gates check one handoff at a time.

Skipped agents: if the arguments start with `--skip <list>`, the comma list names agents this run does not use; the rest is the spec. Only `tester`, `debugger`, `reviewer` and `ui-checker` can be skipped. If the list names any other agent, stop and say which ones can be skipped. A skipped agent's steps below are left out; gates are never skipped.

## 0. Preflight
- No `.factory/config.yml` → stop and tell the user to run `/factory:init`.
- If a factory message at session start said `factory_version` doesn't match the installed plugin, repeat it and ask before continuing.
- If the spec is a file path, read it. If the spec has no acceptance criteria, write them as "Done when" lines in the plan and list them as assumptions.
- `git status`: if there are uncommitted changes, ask before continuing.
- Note the current branch as the base. Create and switch to `factory/<short-spec-slug>`.
- Write `.factory/state/run.json`: `{"kind": "feature", "title": "<spec title>", "base": "<base branch>", "branch": "<run branch>", "started": "<ISO time>", "skip": [<skipped agents>]}`.

## 1. Plan
- Brief the `planner` agent with the spec. It writes `.factory/plan.md`.
- Show the plan's tasks, assumptions and questions.
- If `approval.plan` is `required`, stop here and wait for the user to approve or change it. Do not continue until they say so. Re-plan if asked.

## 2. Build, task by task
For each unticked task in `.factory/plan.md`, in order:
1. Brief the `implementer` agent: task number, plan path, config path.
2. Read `.factory/state/last-verify.json`. If `gaveUp` is true (the hook gave up after `gates.max_verify_retries`) and the debugger is skipped, stop the run and report the task, the command and the failure output. Otherwise brief the `debugger` agent with the task number and that file, then read the file again. If the debugger also gave up, stop the run and report the task, the command, the debugger's root cause and the failure output. Do not continue to later tasks.
3. Unless the tester is skipped, brief the `tester` agent: same task. Read `.factory/state/last-verify.json` again and handle a give-up the same way as in step 2.
4. If the tester reports a production bug, send it back to the implementer once, then re-check.
5. `ok: true` → commit on the run branch: `factory: task <n> — <task title>`.

## 3. Review
- Unless the reviewer is skipped, brief the `reviewer` agent with the base branch name. It writes `.factory/review.md`.
- If `gates.ui_check` is `playwright`, the run changed UI and the UI checker is not skipped, brief the `ui-checker` agent next. It adds a `## UI check` section to `.factory/review.md`.
- Any Blocking item (from the reviewer or the UI check) → brief the implementer with the Blocking items only, then commit and review again. At most `gates.max_review_loops` loops; after that, stop and report what is still blocking.
- If `gates.ui_check` is `manual` and the run changed UI, list the screens a person should check in the final report.

## 4. Finish
- Commit `.factory/plan.md` and `.factory/review.md` (if written) on the run branch.
- Add `"finished": "<ISO time>"` to `.factory/state/run.json`. Do this only here, not when the run stops early.
- Report: branch name, tasks done, verify results, review verdict, skipped agents, anything unresolved.
- Never push, merge, deploy or delete branches. The human merges.
