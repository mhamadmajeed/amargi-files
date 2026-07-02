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

const http = require("http");
const app = require("../server.js");

const IDLE_EXIT_MS = 30 * 1000;
let activeWork = Promise.resolve();
let pendingRuns = 0;
let idleTimer = null;

function scheduleIdleExit() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pendingRuns === 0) {
      console.log("[container] idle — exiting");
      process.exit(0);
    }
  }, IDLE_EXIT_MS);
}

function enqueue(label, work) {
  pendingRuns += 1;
  activeWork = activeWork
    .then(() => {
      console.log(`[container] start: ${label}`);
      return work();
    })
    .catch((error) => console.error(`[container] ${label} failed:`, error.message))
    .finally(() => {
      pendingRuns -= 1;
      console.log(`[container] done: ${label}`);
      scheduleIdleExit();
    });
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
    response.end("ok");
    return;
  }
  const job = request.method === "POST" ? await readBody(request) : {};
  if (job.fileId) {
    enqueue(`export ${job.fileId}`, () => app.runExportJob(job.fileId, {
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
