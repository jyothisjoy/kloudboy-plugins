# factory

Claude Code plugin that runs a software factory in any project. Spec: [docs/PRD.md](../../docs/PRD.md).

## Install

Once per machine (Claude Code with Node.js 18+ on the PATH):

```
/plugin marketplace add <kloudboy-plugins git URL>
/plugin install factory@kloudboy
```

Once per project, in the project folder: run `/factory:init`, review what it wrote, and commit
`.factory/config.yml`, `.gitignore`, `.claude/settings.json` and `CLAUDE.md`.

Teammates who clone a project that has been set up need no init. The committed
`.claude/settings.json` names the marketplace and enables the plugin, so Claude Code offers to
install it when they trust the folder. It looks like this:

```json
{
  "extraKnownMarketplaces": {
    "kloudboy": { "source": { "source": "github", "repo": "<org>/kloudboy-plugins" } }
  },
  "enabledPlugins": { "factory@kloudboy": true }
}
```

On a new release: `/plugin update`, then check the release notes in
[docs/decisions.md](../../docs/decisions.md). A project whose `factory_version` differs from the
installed plugin gets a warning at session start.

## Use

| Command | What it does |
| --- | --- |
| `/factory:init` | Set up this project: writes `.factory/config.yml`, `.claude/settings.json` and a CLAUDE.md draft |
| `/factory:feature <spec>` | Plan → approve → build → test → verify → review → branch with commits |
| `/factory:ui <brief>` | UI R&D from the project's moodboard; you pick a direction |
| `/factory:status` | Current run and plan progress |
| `/factory:dashboard` | Start the local dashboard (http://127.0.0.1:4317) |

To change an agent for one project only, add `.claude/agents/<name>.md` to that project (for
example `.claude/agents/reviewer.md`). The factory commands use it instead of the plugin's agent,
and the hooks still apply their gates to it.

## Gates

| Gate | When | Effect |
| --- | --- | --- |
| Protected paths | Before any Edit/Write | Blocks edits matching `protected_paths` |
| Agent write limits | Before any Edit/Write | Planner writes only `.factory/plan.md`, reviewer only `.factory/review.md`, UI checker only `.factory/review.md` and `.factory/state/`, UI designer only `ui.lab_dir` and `design/` |
| Fast check | After each Edit/Write, if `commands.fast_check` is set | Runs it with the changed file appended; a failure is fed back to the agent |
| Verify | When the implementer, tester or debugger finishes | Runs `commands.verify`; a failure sends the agent back, up to `gates.max_verify_retries`, then the debugger takes over |

The gates watch Edit and Write tools. A file written through a shell command is not checked.

## What's inside

| Path | Contents |
| --- | --- |
| `agents/` | planner, implementer, tester, reviewer, debugger, ui-designer, ui-checker |
| `commands/` | init, feature, ui, status, dashboard |
| `skills/` | nextjs-prisma, wordpress, static-site, ui-craft |
| `hooks/` | `hooks.json` + `run.js` (gates and event emitter, Node built-ins only); tests in `hooks/test/` |
| `dashboard/` | `server.js` + `index.html` (Node built-ins only) |

## Runtime files

- In each project: `.factory/config.yml` (committed), `.factory/state/` (git-ignored: current agent, last verify result, run info), `.factory/plan.md` and `.factory/review.md` (the current run; committed on the run branch).
- On each machine: `~/.factory/runs/<project>/<date>.jsonl` (events), `~/.factory/plugin-root` (path used by `/factory:dashboard`).

## Develop

- Tests: `node --test plugins/factory/hooks/test/run.test.js` from the repo root.
- Try a change without installing: `claude --plugin-dir plugins/factory` in a test project.
