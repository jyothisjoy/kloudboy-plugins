---
name: static-site
description: Kloudboy rules for static HTML/CSS/JS sites. Use when building or reviewing code in a project whose .factory/config.yml has stack static-site.
---
# Static site rules

The project's own CLAUDE.md wins where it differs.

- Keep it static: no server code, no build step unless the project already has one.
- Semantic HTML; every image has `alt`, width and height; pages have one `h1`, a title and a
  meta description.
- Reuse existing CSS variables and classes before adding new ones.
- Verify with the project's build (if any), an HTML validator or link check if configured, and a
  Playwright smoke check of changed pages at desktop and mobile widths.
- Deployment is manual and human-only; never upload or publish.
