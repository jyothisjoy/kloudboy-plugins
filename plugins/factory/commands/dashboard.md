---
description: Start the factory's local dashboard and give its address
---
Start the local factory dashboard:

1. Read the plugin location from `~/.factory/plugin-root` (written at session start). If the file is missing, tell the user to restart Claude Code once so the factory hook can record it.
2. Run: `node "<plugin-root>/dashboard/server.js" --detach`
   It starts the server in the background and exits; if a dashboard is already running it says so.
3. Tell the user to open http://127.0.0.1:4317 (or the port set in `FACTORY_DASHBOARD_PORT`).
