---
name: wordpress
description: Kloudboy rules for WordPress themes and plugins. Use when building or reviewing code in a project whose .factory/config.yml has stack wordpress.
---
# WordPress stack rules

The project's own CLAUDE.md wins where it differs.

## Code
- Follow WordPress coding standards; prefix every function, class, hook and option with the
  project's prefix.
- Escape on output (`esc_html`, `esc_attr`, `esc_url`, `wp_kses_post`), sanitize on input,
  check capabilities and nonces on every form and AJAX/REST handler.
- Enqueue assets with `wp_enqueue_script` / `wp_enqueue_style`; never hard-code tags in templates.
- Don't edit WordPress core or third-party plugins. Use a child theme or a custom plugin.

## Verify
- Usually no unit tests: verify with `php -l` on changed files, the project's linter (phpcs if
  configured), and a Playwright smoke check of changed pages (`gates.ui_check: playwright`).

## Never
- Touch the production database, wp-config.php or server settings.
- Store secrets in theme files or options visible to non-admins.
