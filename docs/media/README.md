# README artwork

The README uses repository-hosted PNG images and GIF previews, with ordinary relative Markdown links. Keep their natural aspect ratios. GitHub controls playback, reduced-motion behavior, and native-app rendering.

`readme-masthead.svg` is the editable source for the Tracepad masthead. It uses the existing trace symbol, colors, and system typography from `DESIGN.md`. The published image is PNG for compatibility with GitHub mobile clients; the README does not depend on SVG, WebP, remote badge services, or theme-switching `<picture>` markup.

After installing the project's dependencies and pinned Chromium, regenerate the masthead with:

```sh
node scripts/render-readme-art.mjs
```

The renderer uses no network resources. System-font fallback can differ by OS; review the generated PNG in both light and dark README previews before committing it. The existing PNG screenshots are real captures of the app. Recording details and individual clips are documented in [the demo index](../DEMO.md).
