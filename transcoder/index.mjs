// Cloudflare Worker fronting the transcoder container.
// - POST /trigger (Bearer TRIGGER_SECRET): wake the container; optional JSON
//   body { fileId, qualities, includeAudio, force } for a specific export.
// - Cron: safety-net sweep so nothing waits on a lost trigger.
import { Container, getContainer } from "@cloudflare/containers";

export class Transcoder extends Container {
  defaultPort = 8080;
  // Backstop only: the container exits by itself ~30s after finishing work.
  sleepAfter = "45m";
}

function r2EnvVars(env) {
  return {
    R2_ACCOUNT_ID: env.R2_ACCOUNT_ID || "",
    R2_BUCKET: env.R2_BUCKET || "",
    R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID || "",
    R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY || "",
    R2_ENDPOINT: env.R2_ENDPOINT || "",
  };
}

async function wakeContainer(env, body) {
  const container = getContainer(env.TRANSCODER);
  try {
    await container.start({ envVars: r2EnvVars(env) });
  } catch {
    // Already running — fall through and hand it the job below.
  }
  return container.containerFetch(new Request("http://transcoder/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/trigger" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    const auth = request.headers.get("authorization") || "";
    if (!env.TRIGGER_SECRET || auth !== `Bearer ${env.TRIGGER_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body = {};
    try { body = await request.json(); } catch {}
    await wakeContainer(env, body);
    return new Response(JSON.stringify({ ok: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  },

  async scheduled(_controller, env) {
    await wakeContainer(env, {});
  },
};
