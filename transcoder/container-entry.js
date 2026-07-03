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
let pendingRuns = 0;
let idleTimer = null;
let lastError = "";
let completedRuns = 0;

const BUILD_MARKER = "single-queue-v1";

// media-db.json is one shared JSON object with plain read-modify-write and no
// locking. Two exports running "in parallel" — even for two DIFFERENT files —
// each hold their own snapshot of the whole DB and can silently clobber each
// other's writes on save. The only safe design here is ONE job running at a
// time, ever. A priority queue (array, not a promise chain) still lets a
// user's own upload jump ahead of a not-yet-started bare sweep, without ever
// running two jobs concurrently.
const queue = [];
const queuedFileIds = new Set();
let queueRunning = false;
let currentLabel = "";

function diagnostics() {
  return {
    buildMarker: BUILD_MARKER,
    envPresent: ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"].filter((k) => process.env[k]),
    ffmpegPath: process.env.FFMPEG_PATH || "",
    ffmpegExists: fs.existsSync(process.env.FFMPEG_PATH || "/usr/bin/ffmpeg"),
    pendingRuns,
    queueDepth: queue.length,
    currentLabel,
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

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (queue.length) {
    const { label, work, fileId } = queue.shift();
    if (fileId) queuedFileIds.delete(fileId);
    currentLabel = label;
    console.log(`[container] start: ${label}`);
    try {
      await work();
      completedRuns += 1;
      console.log(`[container] done: ${label}`);
    } catch (error) {
      lastError = `${label}: ${error.message}`;
      console.error(`[container] ${label} failed:`, error.stack || error.message);
    }
    pendingRuns = queue.length;
  }
  currentLabel = "";
  queueRunning = false;
  scheduleIdleExit();
}

// Sweeps go to the back of the line.
function enqueue(label, work) {
  queue.push({ label, work });
  pendingRuns = queue.length;
  drainQueue();
}

// A specific file's job jumps to the FRONT of the line — but still runs one
// at a time, never concurrently with whatever else is queued or running.
// Deduped: a second request for a file already queued is a no-op.
function runNow(label, work, fileId) {
  if (fileId && queuedFileIds.has(fileId)) return;
  if (fileId) queuedFileIds.add(fileId);
  queue.unshift({ label, work, fileId });
  pendingRuns = queue.length;
  drainQueue();
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
    }), job.fileId);
  } else {
    enqueue("sweep", () => app.requeuePendingProxies());
  }
  response.statusCode = 202;
  response.end(JSON.stringify({ ok: true, queued: pendingRuns }));
}).listen(8080, () => {
  console.log("[container] transcoder listening on 8080");
  enqueue("boot sweep", () => app.requeuePendingProxies());
});
