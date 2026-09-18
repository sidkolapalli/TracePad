// Split the Recordly-rendered tour without recording the user's desktop.
// Requires ffmpeg and ffprobe on PATH; no additional npm dependencies.
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = resolve(root, "docs/media/tracepad-demo.mp4");
const destination = resolve(root, "docs/media/features");
const features = JSON.parse(
  await readFile(new URL("./features.json", import.meta.url), "utf8"),
);
const vtt = await readFile(
  resolve(root, "docs/media/tracepad-demo.vtt"),
  "utf8",
);
const execute = (tool, args) =>
  run(tool, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
const probe = async (path) =>
  JSON.parse(
    (
      await execute("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=codec_name,width,height,pix_fmt,r_frame_rate",
        "-of",
        "json",
        path,
      ])
    ).stdout,
  );
const timestamp = (value) => {
  const ms = Math.round(value);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};
const milliseconds = (value) => {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
};
const cues = [
  ...vtt.matchAll(
    /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\r?\n([^]*?)(?=\r?\n\r?\n|$)/g,
  ),
].map((match) => ({
  start: milliseconds(match[1]),
  end: milliseconds(match[2]),
  text: match[3].trim(),
}));
if (!cues.length) throw new Error("Source captions are missing or invalid.");
const sourceProbe = await probe(source);
const sourceDuration = Number(sourceProbe.format.duration) * 1000;
const ids = new Set();
for (const feature of features) {
  if (!/^[a-z][a-z0-9-]+$/.test(feature.id) || ids.has(feature.id))
    throw new Error("Invalid or duplicate feature id.");
  ids.add(feature.id);
  if (
    ![feature.startMs, feature.endMs, feature.posterMs].every(
      Number.isFinite,
    ) ||
    feature.startMs < 0 ||
    feature.endMs > sourceDuration ||
    feature.endMs <= feature.startMs ||
    feature.endMs - feature.startMs > 40000 ||
    feature.posterMs < feature.startMs ||
    feature.posterMs >= feature.endMs
  ) {
    throw new Error(`Invalid timing: ${feature.id}`);
  }
}
await mkdir(destination, { recursive: true });
const verification = [];
// Limit parallel encodes to two to keep the desktop responsive.
let next = 0;
async function worker() {
  while (next < features.length) {
    const feature = features[next++];
    const path = resolve(destination, `${feature.id}.mp4`);
    const duration = feature.endMs - feature.startMs;
    await execute("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(feature.startMs / 1000),
      "-i",
      source,
      "-t",
      String(duration / 1000),
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-metadata",
      `title=Tracepad | ${feature.title}`,
      "-metadata",
      "comment=Edited synthetic demonstration. Actual Python and external MCP interactions. Rendered with Recordly v1.4.0.",
      path,
    ]);
    await execute("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String((feature.posterMs - feature.startMs) / 1000),
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      "scale=960:-1:flags=lanczos",
      "-c:v",
      "libwebp",
      "-quality",
      "85",
      resolve(destination, `${feature.id}.webp`),
    ]);
    const info = await probe(path);
    const encodedDurationMs = Math.floor(Number(info.format.duration) * 1000);
    const clipCues = cues
      .filter((cue) => cue.end > feature.startMs && cue.start < feature.endMs)
      .map((cue) => ({
        start: Math.max(0, cue.start - feature.startMs),
        end: Math.min(duration, encodedDurationMs, cue.end - feature.startMs),
        text: cue.text,
      }))
      .filter((cue) => cue.end > cue.start);
    if (!clipCues.length) throw new Error(`Missing captions: ${feature.id}`);
    await writeFile(
      resolve(destination, `${feature.id}.vtt`),
      `WEBVTT\n\n${clipCues.map((cue, i) => `${i + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}`).join("\n\n")}\n`,
    );
    const stream = info.streams[0];
    if (
      Math.abs(Number(info.format.duration) * 1000 - duration) > 70 ||
      info.streams.length !== 1 ||
      stream.codec_name !== "h264" ||
      stream.width !== 1440 ||
      stream.height !== 900 ||
      stream.pix_fmt !== "yuv420p"
    ) {
      throw new Error(`Unexpected output format: ${feature.id}`);
    }
    // Decode every frame, including the new cut boundaries.
    await execute("ffmpeg", [
      "-hide_banner",
      "-v",
      "error",
      "-xerror",
      "-i",
      path,
      "-f",
      "null",
      "-",
    ]);
    const result = {
      id: feature.id,
      duration: Number(info.format.duration),
      bytes: (await stat(path)).size,
      captions: clipCues.length,
      decoded: true,
    };
    verification.push(result);
    console.log(
      `${feature.id}: ${result.duration.toFixed(1)}s, ${(result.bytes / 1024 / 1024).toFixed(2)} MiB, decoded OK`,
    );
  }
}
await Promise.all([worker(), worker()]);
await mkdir(resolve(root, "artifacts/demo"), { recursive: true });
await writeFile(
  resolve(root, "artifacts/demo/features-verification.json"),
  JSON.stringify(
    verification.sort(
      (a, b) =>
        features.findIndex((f) => f.id === a.id) -
        features.findIndex((f) => f.id === b.id),
    ),
    null,
    2,
  ),
);
console.log(
  `Finished ${verification.length} feature clips, posters, and caption tracks.`,
);
