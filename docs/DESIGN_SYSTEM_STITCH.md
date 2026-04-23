# Stitch Design System Contract

This repository must implement and preserve the Stitch design system from:

- Project: `projects/11055338306244620688`
- Design system asset: `assets/b61ecc6034304400ae4f747d1a36eee1`
- Name: `Premium Utility`
- Raw export: `docs/stitch-design-system.raw.json`
- Snapshot date: `2026-04-23`

## Mandatory Rule

Every user-facing page (marketing site, extension options/settings tabs, popup, privacy page, and future UI surfaces) must be compliant with these design patterns.

## Core Visual Tokens

### Color

- Background base: `#0d1117`
- Surface stack: `#10141a`, `#181c22`, `#1c2026`, `#262a31`, `#31353c`
- Field/background for controls: `#090c10`
- Stitch baseline borders: `#21262d` (default), `#30363d` (strong), `#8b90a0` (outline)
- Current website readability override (approved): `#2f3947` (default), `#45556b` (strong), `#98aac3` (outline)
- Text: `#dfe2eb` (primary), `#c1c6d6` (secondary), `#8b90a0` (subtle)
- Primary/action: `#1877F2`

### Typography

- Family: `Inter`
- Scale: `display`, `h1`, `h2`, `body-lg`, `body-md`, `label-bold`, `label-md`, `caption`

### Spacing

- 4px baseline grid
- Canonical steps: `4, 8, 16, 24, 32, 48`

### Shape and Elevation

- Sharp geometry (0-4px corner radii)
- No ambient/glassy shadows as elevation
- Depth via tonal layers + 1px borders

## Component Behavior Patterns

- Primary button: solid `#1877F2`, white text.
- Secondary button: hollow, bordered (`#30363d`).
- Panels/cards: 1px border + optional structured header with divider.
- Inputs: dark field (`#090c10`) with blue focus border.
- Tabs/segmented controls: strong active indicator (blue edge/underline).
- Toggles/check controls: high-contrast rectangular style.

## Hard Prohibitions

- No generic AI/SaaS gradients, blobs, glassmorphism, random decorative effects.
- No template-looking filler sections.
- No invented testimonials/logos/metrics/capabilities.
- No “truly local/local” marketing phrasing on user-facing pages; use concrete user-benefit wording.

## Current Implementation Notes

- Homepage uses explicit section containers (bordered blocks) to improve scanability.
- Hover states are intentionally subtle (small tonal shift + 1px border lift + tiny translate).
- In extension settings, dependent configuration groups are hidden until parent toggles are enabled.

## Compliance Checklist (Required For UI Changes)

1. Verify colors/typography/spacing use the Stitch token family.
2. Verify interaction states (hover/focus/active/disabled) are implemented.
3. Verify new pages/components match the same card, control, and navigation patterns.
4. Verify copy remains factual and product-accurate.
