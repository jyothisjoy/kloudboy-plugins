---
description: Start the factory's local dashboard and give its address, or stop it
argument-hint: "[stop]"
---
Arguments: $ARGUMENTS

1. Read the plugin location from `~/.factory/plugin-root` (written at session start). If the file is missing, tell the user to restart Claude Code once so the factory hook can record it.

**If the arguments say `stop`:**

2. Run: `node "<plugin-root>/dashboard/server.js" --stop` and report what it prints.
3. If it says runs started from the dashboard are still working, tell the user how many, and that stopping now also stops those runs. Only if they confirm, run it again with `--stop --force`.

**Otherwise (start):**

2. Run: `node "<plugin-root>/dashboard/server.js" --detach`
   It starts the server in the background and exits; if a dashboard is already running it says so.
3. Tell the user to open http://127.0.0.1:4317 (or the port set in `FACTORY_DASHBOARD_PORT`). They can watch runs there and start one with New run (projects appear once a Claude Code session has opened in them). `/factory:dashboard stop` stops it.
