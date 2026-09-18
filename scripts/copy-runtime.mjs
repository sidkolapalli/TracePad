import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(project, "node_modules", "pyodide");
const target = join(project, "public", "python");
const manifest = JSON.parse(
  await readFile(join(source, "package.json"), "utf8"),
);
const available = await readdir(source);
// Support the official core distribution's .js and .mjs loader variants.
const files = available.filter(
  (name) =>
    /^pyodide(?:\.asm)?\.(?:m?js|wasm)$/.test(name) ||
    name === "python_stdlib.zip" ||
    name === "pyodide-lock.json" ||
    /^LICENSE(?:\.|$)/i.test(name),
);
for (const required of [
  "pyodide.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
]) {
  if (!files.includes(required))
    throw new Error(
      `Installed Pyodide is missing ${required}. Reinstall dependencies before starting Tracepad.`,
    );
}
await mkdir(target, { recursive: true });
await Promise.all(
  files.map((file) => copyFile(join(source, file), join(target, file))),
);
// The pinned npm package does not ship its MPL license text. Keep the exact
// upstream notice next to the runtime as well as in the full app notices.
const noticeManifest = JSON.parse(
  await readFile(join(project, "docs/licenses/runtime/sources.json"), "utf8"),
);
if (noticeManifest.pyodide !== manifest.version) {
  throw new Error(
    "Review the runtime attribution before copying a new Pyodide version.",
  );
}
await copyFile(
  join(project, "docs/licenses/runtime/PYODIDE-LICENSE.txt"),
  join(target, "LICENSE.txt"),
);
console.log(
  `Copied Pyodide ${manifest.version} (${files.length} core files) to public/python for offline use.`,
);
