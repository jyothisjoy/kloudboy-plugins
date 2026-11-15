---
name: ui-craft
description: Kloudboy UI quality rules — typography, spacing, colour, accessibility and anti-patterns. Use when designing, building or checking any user interface.
---
# UI craft

## Direction
- Every screen has one clear primary action and an obvious reading order.
- Pick a direction and commit: a type pairing, a spacing scale, a radius, a density. Write them
  as tokens; never hard-code one-off values.
- Distinct directions differ in structure and character (layout, type, density, imagery),
  not just colour.

## Typography
- At most two families. A clear scale (e.g. 12/14/16/20/24/32/48) with consistent line heights.
- Body text 16px minimum on the web; line length 50–80 characters.

## Spacing and layout
- Use one spacing scale (4 or 8 based). Align to a grid.
- Design mobile (390px) and desktop (1440px) explicitly; nothing overflows horizontally.

## Colour and accessibility
- Text contrast meets WCAG AA: 4.5:1 for body text, 3:1 for large text and UI controls.
- Never use colour alone to carry meaning.
- Visible focus states; every interactive element reachable by keyboard; touch targets 44px+.
- Every state designed: empty, loading, error, success.

## Avoid
- Generic template look: centred hero + three feature cards + gradient blob by default.
- Gradients, glows and heavy shadows as decoration.
- Placeholder copy ("Lorem ipsum", "Feature one") in anything shown for review.
- More than one accent colour competing for attention.
