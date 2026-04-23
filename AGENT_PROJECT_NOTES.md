# Agent Project Notes

Last scanned: 2026-04-23
Workspace: `/Users/andrei/Desktop/fb-market`

## Project Summary

Browser extension for Facebook that blocks Reels entry points/pages to keep Marketplace usage focused.

- Stack: plain HTML/CSS/JavaScript (no framework, no bundler, no package.json).
- Extension model: Manifest V3 with service worker background script.
- Browsers targeted: Chrome, Edge, Firefox.
- Localization: `_locales/en/messages.json` and `_locales/es/messages.json`.

## Key Files

- `manifest.json`: active root manifest (version `1.9`).
- `background.js`: state normalization/synchronization, alarms, schedule logic, badge state.
- `content.js`: Reels detection/hiding, redirect behavior, mutation observer, route watcher, click interception.
- `popup.html` + `popup.js`: quick on/off, pause/resume, hard lock pending-disable flow, open settings.
- `options.html` + `options.js`: full settings UI (tabs: blocking, controls, schedule).
- `extension.css`: shared extension design-system tokens/components for `options.html` and `popup.html`.
- `logo_v2.png`: canonical extension/brand logo filename; source asset at repo root.
- `manifests/manifest.*.json`: browser-specific manifest templates used by build script.
- `scripts/build-browser-package.sh`: copies source + target manifest into `dist/<target>/`.
- `CROSS_BROWSER.md`: short build notes.
- `docs/DESIGN_SYSTEM_STITCH.md`: required compliance contract for Stitch design patterns.
- `docs/stitch-design-system.raw.json`: raw Stitch design system payload snapshot.
- `site/`: Vercel-ready SEO marketing site for the extension.
  - `site/index.html`: landing page with sectioned layout, comparison block for MarketClean, and hover states.
  - `site/privacy.html`: privacy policy page.
  - `site/privacy/index.html`: directory route version used for local/static hosting compatibility (`/privacy/`).
  - `site/styles.css`: custom visual system (non-Tailwind palette).
  - `site/robots.txt` + `site/sitemap.xml`: crawl/indexing hints.
  - `site/vercel.json`: headers and clean URL config.

## Runtime Model

`background.js` is the source of truth for normalized runtime state.

It normalizes, persists, and syncs:

- `enabled`
- `effectiveEnabled`
- `pauseUntil`
- `blockMode` (`strict` | `hide_only`)
- `defaultPauseMinutes` (5..180)
- `reelsExceptions` (deduped list)
- `confirmBeforeDisable`
- `confirmBeforePause`
- `hardLockEnabled`
- `hardLockCooldownMinutes` (0..180)
- `hardLockPendingDisableUntil`
- `scheduleEnabled`
- `scheduleStartTime` / `scheduleEndTime` (`HH:MM`)
- `scheduleDays` (0..6)

Alarms used:

- `pause-resume`
- `hard-lock-disable`
- `schedule-tick` (every minute when schedule is enabled)

Badge states:

- `on` (active)
- `PAUS` (paused)
- `OFF` (disabled)

## Blocking Behavior

`content.js` behavior:

- Runs on `*://*.facebook.com/*` at `document_start`.
- Detects Reels by link patterns, aria/title text, headings, and container hints.
- Hides Reels navigation/entry points and related module containers.
- In `strict` mode:
  - redirects from `/reel` or `/reels` paths to `https://www.facebook.com/`
  - intercepts clicks on Reels-like targets and redirects.
- In `hide_only` mode:
  - only hides entries/containers; no redirect enforcement.
- Exceptions support:
  - full URL prefixes
  - host/path rules (`facebook.com/page`)
  - path prefixes (`/profile`)
  - host-only rules (`example.com`)

## UI Behavior

Popup:

- toggle blocking on/off
- pause for `defaultPauseMinutes` or resume now
- hard lock branch: can queue delayed disable (`hardLockPendingDisableUntil`) or keep blocking
- schedule-active outside window disables manual toggle

Options:

- Tabbed UI with keyboard navigation and hash-based tab state.
- Blocking tab: mode, default pause duration, exceptions textarea.
- Controls tab: confirm toggles + hard lock + cooldown.
- Schedule tab: enable, start/end time, day selection.
- Schedule and Hard Lock dependent fields are hidden until their section toggle is enabled.
- Prevents schedule save when enabled and no day selected.

## Build / Packaging

Build target folders:

- `scripts/build-browser-package.sh chrome`
- `scripts/build-browser-package.sh edge`
- `scripts/build-browser-package.sh firefox`

Script output:

- writes `dist/<target>/`
- copies core source files, `_locales/`, `logo_v2.png`
- copies `extension.css` for shared popup/options styling
- copies `manifests/manifest.<target>.json` as `dist/<target>/manifest.json`
- does not zip packages
- website logo at `site/assets/logo_v2.png` should match root `logo_v2.png`

## Important Observations

- Version mismatch currently exists:
  - root `manifest.json` is `1.9`
  - `manifests/manifest.chrome.json`, `manifest.edge.json`, `manifest.firefox.json` are `1.8`
- `dist/` already exists with target folders; treat as build artifacts.
- Marketing site: `https://market-focus.andreiprojects.com` (served from `site/`, historically also on Vercel aliases).

## Design System Compliance (Mandatory)

Source of truth is the Stitch project design system:

- Project: `projects/11055338306244620688`
- Design system asset: `assets/b61ecc6034304400ae4f747d1a36eee1`
- Name: `Premium Utility`
- Raw payload snapshot: `docs/stitch-design-system.raw.json`

Every user-facing page/surface must comply with these patterns:

- Use Inter typography scale from Stitch (`display`, `h1`, `h2`, `body-lg`, `body-md`, `label-bold`, `label-md`, `caption`).
- Use the dark high-contrast tonal layer stack (`#0d1117`, `#10141a`, `#181c22`, `#1c2026`, `#262a31`, `#31353c`).
- Current website implementation uses higher-contrast border tokens for readability (`#2f3947`, `#45556b`, `#98aac3`).
- Use `#1877F2` for primary actions and active states only.
- No decorative gradients, glassmorphism, soft shadows, or rounded “pill” styling.
- Prefer 0-4px corner radii, structured card headers, and segmented/tabbed controls with clear active indicators.
- Do not use “local/truly local” as homepage marketing terminology; prefer user-facing benefit language (distance control, nearby results, cleaner feed).
- Keep content factual: no invented logos/testimonials/metrics/capabilities.

## Fast Re-Onboarding Checklist

When returning later, start here instead of rescanning:

1. Read this file.
2. Open only files relevant to requested change area:
   - runtime/state logic: `background.js`
   - DOM blocking heuristics: `content.js`
   - user controls: `popup.js` / `options.js`
   - shipping/build: `manifests/*` + `scripts/build-browser-package.sh`
3. If release-related, confirm all manifest versions are aligned.
