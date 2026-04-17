# Project Operations

## Build Commands
- `pnpm run build` - Compile TypeScript sources into `dist/` and copy static extension assets

## Validation
- `pnpm run typecheck` - Run strict TypeScript checks for source, tests, and scripts
- `pnpm run test` - Run unit tests for keyword matching and settings normalization
- `pnpm run validate` - Run typecheck, test, and build in sequence

## Runtime
- Load `dist/` as an unpacked extension in a Chromium browser
- Open an `https://x.com/*/status/*` page to activate scanning

## Operational Notes
- Auto-block is off by default and must be enabled from the popup
- DOM selectors on X can drift; failures should be reported without stopping the rest of the scan
- Validation must pass before considering the implementation complete
