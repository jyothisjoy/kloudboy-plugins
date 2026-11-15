---
description: UI R&D — explore 2–3 visual directions from the project's moodboard and stop for a pick
argument-hint: <brief: what screens or feel you need>
---
Run UI R&D for this brief:

$ARGUMENTS

1. No `.factory/config.yml` → stop and tell the user to run `/factory:init`.
2. Write `.factory/state/run.json` with `{"title": "UI: <brief summary>", "started": "<ISO time>"}`.
3. Brief the `ui-designer` agent with the brief and the config path, in the foreground. Use `ui-designer` if the project has `.claude/agents/ui-designer.md`, otherwise `factory:ui-designer`.
4. Show the user each direction: its summary, trade-offs and screenshot paths in `design/research/shots/`, plus the agent's recommendation.
5. If `approval.ui_direction` is `required`, stop and wait for the user to pick a direction.
6. After the pick: merge that direction's tokens into `ui.design_system` (create it if empty), and write `design/research/chosen.md` naming the direction and its reference screenshots so later `/factory:feature` runs build against them. Leave the other directions in the lab folder; tell the user they can delete them.
