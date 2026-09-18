// Create silent, looping README previews from the existing feature videos.
// Requires ffmpeg and ffprobe on PATH. Run: node scripts/demo/animate-previews.mjs
// Pass feature IDs to regenerate only those previews, keeping prior verification.
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const destination = resolve(root, "docs/media/features");
const features = JSON.parse(
  await readFile(new URL("./features.json", import.meta.url), "utf8"),
);
// Local times within each feature MP4, curated around its actual interaction.
// Short scenes hold their final frame rather than showing the next feature.
const windows = {
  projects: { start: 5.2, duration: 6.2 },
  "python-modules": { start: 12.5, duration: 8 },
  "trace-tables": { start: 0, duration: 5.2, hold: 0.8 },
  flowcharts: { start: 0, duration: 4.8, hold: 1.2 },
  "reasoning-notes": { start: 0, duration: 3.8, hold: 2.2 },
  "input-stdlib": { start: 2, duration: 7, hold: 1 },
  debugging: { start: 2.5, duration: 6, hold: 2 },
  "stop-recover": { start: 0, duration: 7 },
  "timed-mock": { start: 8, duration: 8 },
  "live-followup": { start: 10, duration: 8 },
  "debrief-review": { start: 21, duration: 8 },
  "ai-question": { start: 5.2, duration: 8 },
  "contextual-hint": { start: 10.8, duration: 8 },
  "themes-saving": { start: 3, duration: 8 },
};
const width = 960;
const height = 600;
const fps = 10;
const perFileBudget = 10_000_000;
const preferredTotalBudget = 15_000_000;
const totalBudget = 25_000_000;
const run = promisify(execFile);
const execute = (tool, args) =>
  run(tool, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
const probe = async (path, countFrames = false) =>
  JSON.parse(
    (
      await execute("ffprobe", [
        "-v",
        "error",
        ...(countFrames ? ["-count_frames"] : []),
        "-show_entries",
        "format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_read_frames",
        "-of",
        "json",
        path,
      ])
    ).stdout,
  );

const ids = features.map((feature) => feature.id);
if (
  new Set(ids).size !== ids.length ||
  ids.length !== Object.keys(windows).length ||
  ids.some((id) => !/^[a-z][a-z0-9-]+$/.test(id) || !windows[id])
) {
  throw new Error("Each feature needs exactly one curated preview window.");
}
await mkdir(destination, { recursive: true });
const results = [];
const requestedIds = process.argv.slice(2);
if (requestedIds.some((id) => !ids.includes(id)))
  throw new Error(
    "Unknown feature ID. Pass existing IDs without option flags.",
  );
const selected = requestedIds.length
  ? features.filter((feature) => requestedIds.includes(feature.id))
  : features;
if (requestedIds.length) {
  const prior = JSON.parse(
    await readFile(
      resolve(root, "artifacts/demo/gif-verification.json"),
      "utf8",
    ),
  );
  for (const id of ids.filter((id) => !requestedIds.includes(id))) {
    const cached = prior.previews.find((preview) => preview.id === id);
    if (
      !cached?.decoded ||
      JSON.stringify(cached.sourceWindow) !== JSON.stringify(windows[id]) ||
      cached.bytes !== (await stat(resolve(destination, `${id}.gif`))).size
    ) {
      throw new Error(`Unchanged preview needs full regeneration: ${id}`);
    }
    results.push(cached);
  }
}
let next = 0;
async function worker() {
  while (next < selected.length) {
    const feature = selected[next++];
    const window = windows[feature.id];
    const source = resolve(destination, `${feature.id}.mp4`);
    const output = resolve(destination, `${feature.id}.gif`);
    const input = await probe(source);
    const expectedDuration = window.duration + (window.hold ?? 0);
    const expectedFrames = Math.round(expectedDuration * fps);
    if (
      input.streams.length !== 1 ||
      input.streams[0].width / input.streams[0].height !== width / height ||
      window.start < 0 ||
      window.duration <= 0 ||
      window.start + window.duration > Number(input.format.duration) ||
      expectedDuration < 6 ||
      expectedDuration > 8
    ) {
      throw new Error(`Invalid preview source or window: ${feature.id}`);
    }
    const filter = [
      `trim=duration=${window.duration}`,
      "setpts=PTS-STARTPTS",
      `fps=${fps}`,
      `scale=${width}:${height}:flags=lanczos`,
      "setsar=1",
      ...(window.hold
        ? [`tpad=stop_mode=clone:stop_duration=${window.hold}`]
        : []),
    ].join(",");
    await execute("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-threads",
      "2",
      "-ss",
      String(window.start),
      "-i",
      source,
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      `${filter},split[frames][colors];[colors]palettegen=max_colors=256:stats_mode=diff[palette];[frames][palette]paletteuse=dither=none:diff_mode=rectangle`,
      "-an",
      "-frames:v",
      String(expectedFrames),
      "-gifflags",
      "+offsetting+transdiff",
      "-loop",
      "0",
      "-map_metadata",
      "-1",
      output,
    ]);

    const info = await probe(output, true);
    const stream = info.streams[0];
    const duration = Number(info.format.duration);
    const frames = Number(stream.nb_read_frames);
    const bytes = (await stat(output)).size;
    // NETSCAPE repeat count zero means an infinite loop, not a one-shot GIF.
    const data = await readFile(output);
    const loopsInfinitely = data.includes(
      Buffer.from([
        ...Buffer.from("NETSCAPE2.0", "ascii"),
        0x03,
        0x01,
        0x00,
        0x00,
        0x00,
      ]),
    );
    if (
      info.streams.length !== 1 ||
      stream.codec_name !== "gif" ||
      stream.width !== width ||
      stream.height !== height ||
      stream.r_frame_rate !== `${fps}/1` ||
      frames !== expectedFrames ||
      frames <= 1 ||
      Math.abs(duration - expectedDuration) > 0.011 ||
      !loopsInfinitely ||
      bytes >= perFileBudget
    ) {
      throw new Error(
        `Unexpected GIF format, duration, or size: ${feature.id}`,
      );
    }
    // Decode every frame and check that visible pixels actually change.
    const decoded = await execute("ffmpeg", [
      "-hide_banner",
      "-v",
      "error",
      "-xerror",
      "-ignore_loop",
      "1",
      "-i",
      output,
      "-pix_fmt",
      "rgb24",
      "-f",
      "framemd5",
      "-",
    ]);
    const hashes = decoded.stdout
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(",").at(-1).trim());
    const uniqueFrames = new Set(hashes).size;
    if (hashes.length !== frames || uniqueFrames <= 1)
      throw new Error(`Preview has no decoded animation: ${feature.id}`);
    const result = {
      id: feature.id,
      source: `docs/media/features/${feature.id}.mp4`,
      output: `docs/media/features/${feature.id}.gif`,
      sourceWindow: window,
      width: stream.width,
      height: stream.height,
      fps,
      duration,
      frames,
      uniqueFrames,
      loopsInfinitely,
      decoded: true,
      bytes,
      withinFileBudget: true,
    };
    results.push(result);
    console.log(
      `${feature.id}: ${duration.toFixed(1)}s, ${frames} frames, ${(bytes / 1_000_000).toFixed(2)} MB, decoded OK`,
    );
  }
}
// Keep at most two encodes active so the desktop remains responsive.
await Promise.all([worker(), worker()]);
results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0);
const verification = {
  generatedAt: new Date().toISOString(),
  regeneratedIds: selected.map((feature) => feature.id),
  completed: true,
  count: results.length,
  totalBytes,
  perFileBudget,
  preferredTotalBudget,
  totalBudget,
  withinPreferredTotalBudget: totalBytes < preferredTotalBudget,
  withinTotalBudget: totalBytes < totalBudget,
  previews: results,
};
await mkdir(resolve(root, "artifacts/demo"), { recursive: true });
await writeFile(
  resolve(root, "artifacts/demo/gif-verification.json"),
  `${JSON.stringify(verification, null, 2)}\n`,
);
console.log(
  `Finished ${results.length} animated previews: ${(totalBytes / 1_000_000).toFixed(2)} MB total (preferred <15 MB; limit <25 MB).`,
);
if (!verification.withinTotalBudget) process.exitCode = 1;
