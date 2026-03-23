# Cross-Browser Build

This project supports Chrome, Edge, and Firefox from a shared codebase.

## Build targets

- Chrome: `scripts/build-browser-package.sh chrome`
- Edge: `scripts/build-browser-package.sh edge`
- Firefox: `scripts/build-browser-package.sh firefox`

Each command creates a browser-ready folder in `dist/<target>/` with:

- `manifest.json` (target-specific)
- extension source files
- `_locales/` translations

## Manifest sources

- `manifests/manifest.chrome.json`
- `manifests/manifest.edge.json`
- `manifests/manifest.firefox.json`

## Notes

- Edge uses the same MV3 structure as Chrome.
- Firefox uses `browser_specific_settings.gecko` metadata.
- Build script does not create zip files; packaging is intentionally manual.
