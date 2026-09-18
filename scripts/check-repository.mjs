import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const failures = [];
// Include untracked, non-ignored files so this also checks a first release
// before git add. Tracked files remain visible even if newly ignored.
const files = [
  ...new Set(
    git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
      .split("\0")
      .filter(Boolean),
  ),
];
const forbidden =
  /^(?:\.claude|\.codex|\.agents|\.impeccable|\.localpad|\.vscode|node_modules|dist|artifacts|test-results|playwright-report|public\/python)(?:\/|$)|(?:^|\/)\.env(?:\..+)?$|\.(?:sqlite(?:-wal|-shm)?|db|log|tsbuildinfo)$/i;
const textFiles = /\.(?:[cm]?[jt]sx?|json|md|html|css|ya?ml|toml|txt|svg)$/i;
const machinePath =
  /(?:[A-Z]:[\\/]Users[\\/][^\s/\\<>]+|\/(?:Users|home)\/[a-z0-9_-]+\/)/i;
const credential =
  /\b(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,}|sk-[a-zA-Z0-9_-]{30,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;

for (const file of files) {
  if (forbidden.test(file) && !file.endsWith(".env.example"))
    failures.push(
      `${file}: local, generated, or private file in public source set`,
    );
  if (!textFiles.test(file)) continue;
  const source = await readFile(resolve(root, file), "utf8");
  if (machinePath.test(source))
    failures.push(`${file}: machine-specific home directory found`);
  if (credential.test(source))
    failures.push(`${file}: possible credential found; inspect locally`);
}

for (const required of [
  "LICENSE",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/EXERCISE_TEMPLATE.md",
  "docs/ALPHA_CHECKLIST.md",
  ".github/workflows/ci.yml",
  "package-lock.json",
]) {
  if (!files.includes(required))
    failures.push(`${required}: missing from public source set`);
}

const manifest = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const lock = JSON.parse(
  await readFile(resolve(root, "package-lock.json"), "utf8"),
);
if (manifest.name !== lock.name || manifest.name !== lock.packages[""]?.name)
  failures.push("package.json / package-lock.json: names must agree");
if (
  manifest.license !== "MIT" ||
  lock.packages[""]?.license !== manifest.license
)
  failures.push(
    "package.json / package-lock.json: license metadata must agree",
  );
if (
  manifest.version !== lock.version ||
  manifest.version !== lock.packages[""]?.version
)
  failures.push("package.json / package-lock.json: versions must agree");
if (!manifest.private)
  failures.push(
    "package.json: keep npm publishing disabled for this source-only alpha",
  );
for (const section of ["dependencies", "devDependencies"]) {
  if (
    JSON.stringify(manifest[section]) !==
    JSON.stringify(lock.packages[""]?.[section])
  )
    failures.push(`${section}: manifest and lockfile differ`);
  for (const [name, version] of Object.entries(manifest[section] ?? {})) {
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
      failures.push(`${name}: pin a concrete dependency version`);
  }
}

if (failures.length) {
  console.error(
    `Repository checks failed:\n${failures.map((message) => `- ${message}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${files.length} public source files and package metadata. No known private paths or credential patterns found.`,
  );
  console.log(
    "This is a release hygiene check, not a comprehensive secret or license audit.",
  );
}
