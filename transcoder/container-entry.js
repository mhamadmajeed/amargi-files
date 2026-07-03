// Entrypoint for the Cloudflare Container transcoder.
//
// Reuses the app's own export pipeline (server.js) with FFmpeg installed in
// the image. Behavior:
//   - On boot: run a full sweep (any video missing auto renditions/MP3).
//   - POST /   : optional JSON job { fileId, qualities, includeAudio, force }
//                runs that specific export, otherwise re-runs a full sweep.
//   - GET /health : liveness probe.
//   - Exits when idle so the container scales to zero (billing stops);
//     the Worker's cron and app triggers boot it again when needed.
process.env.DATA_DIR = process.env.DATA_DIR || "/tmp/amargi-data";

const fs = require("fs");
const http = require("http");
const app = require("../server.js");

const IDLE_EXIT_MS = 30 * 1000;
let activeWork = Promise.resolve();
let pendingRuns = 0;
let idleTimer = null;
let lastError = "";
let completedRuns = 0;

const BUILD_MARKER = "stderr-capture-v2";

function diagnostics() {
  return {
    buildMarker: BUILD_MARKER,
    envPresent: ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"].filter((k) => process.env[k]),
    ffmpegPath: process.env.FFMPEG_PATH || "",
    ffmpegExists: fs.existsSync(process.env.FFMPEG_PATH || "/usr/bin/ffmpeg"),
    pendingRuns,
    completedRuns,
    lastError,
    uptimeSec: Math.round(process.uptime()),
  };
}

function scheduleIdleExit() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pendingRuns === 0) {
      console.log("[container] idle — exiting");
      process.exit(0);
    }
  }, IDLE_EXIT_MS);
}

function runTracked(label, work) {
  pendingRuns += 1;
  const done = () => {
    pendingRuns -= 1;
    completedRuns += 1;
    console.log(`[container] done: ${label}`);
    scheduleIdleExit();
  };
  console.log(`[container] start: ${label}`);
  return work()
    .catch((error) => {
      lastError = `${label}: ${error.message}`;
      console.error(`[container] ${label} failed:`, error.stack || error.message);
    })
    .finally(done);
}

// Sweeps run one at a time (a big backlog shouldn't overlap with itself).
function enqueue(label, work) {
  activeWork = activeWork.then(() => runTracked(label, work));
}

// A specific file's job runs immediately, in parallel with any sweep, so a
// user waiting on one upload is never stuck behind an unrelated backlog.
function runNow(label, work) {
  runTracked(label, work);
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    request.on("error", () => resolve({}));
  });
}

http.createServer(async (request, response) => {
  if (request.url.startsWith("/health")) {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(diagnostics()));
    return;
  }
  const job = request.method === "POST" ? await readBody(request) : {};
  if (job.fileId) {
    runNow(`export ${job.fileId}`, () => app.runExportJob(job.fileId, {
      qualities: Array.isArray(job.qualities) ? job.qualities : ["1080", "480"],
      includeAudio: job.includeAudio !== false,
      includeThumbnail: true,
      force: Boolean(job.force),
    }));
  } else {
    enqueue("sweep", () => app.requeuePendingProxies());
  }
  response.statusCode = 202;
  response.end(JSON.stringify({ ok: true, queued: pendingRuns }));
}).listen(8080, () => {
  console.log("[container] transcoder listening on 8080");
  enqueue("boot sweep", () => app.requeuePendingProxies());
});
