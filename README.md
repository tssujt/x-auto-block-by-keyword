# X Auto Block By Keyword

[![License: MIT](https://img.shields.io/badge/License-MIT-2f7d32.svg)](./LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220.svg?logo=pnpm&logoColor=white)
![Chrome Extension MV3](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4.svg?logo=googlechrome&logoColor=white)

Chromium browser extension, now authored in TypeScript, that scans replies under an X tweet and blocks reply authors whose reply text matches configured keywords.

## Features
- Configure keywords from the options page
- Add keywords directly from the X status page through an in-page quick-add input
- Mark matching replies inline on X status pages
- Manually block a matched reply author from the page
- Optional auto-block queue for sequential blocking
- Build a loadable unpacked extension into `dist/`

## Local Validation
```bash
pnpm install
pnpm run validate
```

## Load Unpacked
1. Open `chrome://extensions`
2. Enable Developer mode
3. Run `pnpm run build`
4. Click "Load unpacked"
5. Select the `dist` directory inside this repository

## Usage
1. Open a tweet detail page on `x.com`
2. Open the extension options page and set keywords
3. Use the popup to scan the current tweet
4. Enable auto-block if you want matching replies blocked automatically

## Notes
- This extension depends on X's current DOM and menu labels; if X changes them, selector updates may be required.
- Auto-block is intentionally disabled by default.
- TypeScript source lives under `src/`; static assets remain in the repo root and are copied into `dist/` during build.

## License
[MIT](./LICENSE)
