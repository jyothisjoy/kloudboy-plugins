---
description: Show the current factory run and plan progress for this project
---
Report the factory status for this project, briefly:

- No `.factory/config.yml` → say the factory isn't set up and suggest `/factory:init`.
- From `.factory/state/run.json`: run title, branch, start time.
- From `.factory/plan.md`: tasks done / total, and the next unticked task.
- From `.factory/state/last-verify.json`: last verify result and when.
- From `.factory/review.md`: verdict and number of blocking items, if a review exists.
- Current agent, if `.factory/state/current-agent` exists.

Read files only. Don't change anything.
