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
| `/factory:feature [--skip <agents>] <spec>` | Plan → approve → build → test → verify → review → branch with commits. `--skip tester,reviewer` turns optional agents off (tester, debugger, reviewer, ui-checker); gates still run |
| `/factory:bugfix [--skip <agents>] <bug report>` | Diagnose → approve → failing regression test → fix → verify → review → branch. Can skip tester, reviewer |
| `/factory:security [--skip <agents>] [focus]` | Audit → you pick findings → fix each with verify → review → branch. Focus: paths, an area or "changes since <branch>"; empty = whole project. Can skip tester, debugger, reviewer |
| `/factory:ui <brief>` | UI R&D from the project's moodboard; you pick a direction |
| `/factory:status` | Current run and plan progress |
| `/factory:dashboard [stop]` | Start the local dashboard (http://127.0.0.1:4317), or stop it. Stopping refuses while runs started from the dashboard are working, unless you confirm; then they stop too. Outside Claude Code: `node <plugin>/dashboard/server.js --stop [--force]` |

### Start a run from the dashboard

Open the dashboard and choose **New run**: pick the project and the run type (feature, bug fix or security check), write the spec, bug report or focus, switch off agents you
don't need, and choose the permission mode. The dashboard runs `/factory:feature` in a headless
Claude Code session in that project. When the factory stops (plan approval, a question, the final
report) the run card shows its last message and the plan; **Approve plan** or **Send reply** continues
the same session.

- A project appears once a Claude Code session has opened in it with the factory installed.
- Headless sessions can't ask for permission. With **Accept edits**, add your verify, test and git
  commands to the project's or your permission allow rules, or the run stops on them. **Auto** avoids
  that where your account has auto mode. Skipping all permission checks is not offered from the
  dashboard; start such a run in the terminal if you need it.
- Only the dashboard page on this machine can start runs (page token and host check).

### Team dashboard

Team mode sends events to the collector set in your environment, `FACTORY_DASHBOARD_URL` (HTTPS, or
http on this machine), with `FACTORY_DASHBOARD_KEY`. A project only opts in with `dashboard.mode: team`;
the URL is never read from a project's config.

To change an agent for one project only, add `.claude/agents/<name>.md` to that project (for
example `.claude/agents/reviewer.md`). The factory commands use it instead of the plugin's agent,
and the hooks still apply their gates to it.

## Gates

| Gate | When | Effect |
| --- | --- | --- |
| Protected paths | Before any Edit/Write | Blocks edits matching `protected_paths` |
| Agent write limits | Before any Edit/Write | Planner writes only `.factory/plan.md`, reviewer only `.factory/review.md`, security reviewer only `.factory/security.md`, UI checker only `.factory/review.md` and `.factory/state/`, UI designer only `ui.lab_dir` and `design/` |
| Fast check | After each Edit/Write, if `commands.fast_check` is set | Runs it with the changed file appended; a failure is fed back to the agent |
| Verify | When the implementer, tester or debugger finishes | Runs `commands.verify`; a failure sends the agent back, up to `gates.max_verify_retries`, then the debugger takes over |

The gates watch Edit and Write tools. A file written through a shell command is not checked.

## What's inside

| Path | Contents |
| --- | --- |
| `agents/` | planner, implementer, tester, reviewer, debugger, security-reviewer, ui-designer, ui-checker |
| `commands/` | init, feature, bugfix, security, ui, status, dashboard |
| `skills/` | nextjs-prisma, wordpress, static-site, ui-craft, security-audit (used by the security reviewer; see its NOTICE.md) |
| `hooks/` | `hooks.json` + `run.js` (gates and event emitter, Node built-ins only); tests in `hooks/test/` |
| `dashboard/` | `server.js` + `index.html` (Node built-ins only) |

## Runtime files

- In each project: `.factory/config.yml` (committed), `.factory/state/` (git-ignored: current agent, last verify result, run info), `.factory/plan.md`, `.factory/review.md` and `.factory/security.md` (the current run; committed on the run branch).
- On each machine: `~/.factory/runs/<project>/<date>.jsonl` (events), `~/.factory/plugin-root` (path used by `/factory:dashboard`), `~/.factory/projects.json` (project folders the dashboard may start runs in), `~/.factory/launches.json` and `launches/<id>.log` (dashboard-started runs).

## Develop

- Tests: `node --test plugins/factory/hooks/test/run.test.js plugins/factory/dashboard/test/server.test.js` from the repo root.
- Dashboard with an uninstalled plugin: set `FACTORY_PLUGIN_DIR` to `plugins/factory` before starting `server.js`; the sessions it starts get `--plugin-dir`.
- Try a change without installing: `claude --plugin-dir plugins/factory` in a test project.
