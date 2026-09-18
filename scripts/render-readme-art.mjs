import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Keep the editable brand source in Git; publish PNG for GitHub mobile clients.
// No network access or external fonts are needed. The type follows DESIGN.md.
const source = new URL("../docs/media/readme-masthead.svg", import.meta.url);
const destination = new URL("../docs/media/readme-masthead.png", import.meta.url);
const svg = await readFile(source, "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 400 },
    deviceScaleFactor: 1,
  });
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    `<html lang="en"><head><meta charset="utf-8"><title>Tracepad masthead</title><style>html,body{margin:0;width:1600px;height:400px;background:#12151b}svg{display:block;width:1600px;height:400px}</style></head><body>${svg}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(destination) });
  console.log("Rendered docs/media/readme-masthead.png from its SVG source.");
} finally {
  await browser.close();
}
