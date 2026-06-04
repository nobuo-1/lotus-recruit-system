// web/src/worker/formOutreachAutomation.worker.ts
import "@/lib/loadEnv";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

const appUrl =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";
const cronSecret = process.env.FORM_OUTREACH_CRON_SECRET || "";
const intervalMs = Math.max(
  MIN_INTERVAL_MS,
  Number(process.env.FORM_OUTREACH_AUTOMATION_INTERVAL_MS || DEFAULT_INTERVAL_MS)
);

let running = false;
let stopped = false;

function cronUrl() {
  return new URL("/api/form-outreach/automation/cron", appUrl).toString();
}

async function tick(trigger: "startup" | "interval" | "manual") {
  if (running) {
    console.log("[form-outreach.automation.skip]", {
      trigger,
      reason: "previous tick is still running",
    });
    return;
  }
  if (!cronSecret) {
    console.error("[form-outreach.automation.error]", {
      trigger,
      error: "FORM_OUTREACH_CRON_SECRET is not set",
    });
    return;
  }

  running = true;
  const startedAt = new Date().toISOString();
  try {
    const res = await fetch(cronUrl(), {
      method: "POST",
      headers: {
        "x-cron-token": cronSecret,
        "content-type": "application/json",
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[form-outreach.automation.fail]", {
        trigger,
        status: res.status,
        response: json,
        startedAt,
      });
      return;
    }
    console.log("[form-outreach.automation.done]", {
      trigger,
      startedAt,
      tenants: Array.isArray(json?.tenants) ? json.tenants.length : 0,
      response: json,
    });
  } catch (error) {
    console.error("[form-outreach.automation.fail]", {
      trigger,
      startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

console.log("[form-outreach.automation.worker.start]", {
  appUrl,
  intervalMs,
  hasCronSecret: !!cronSecret,
});

void tick("startup");

const timer = setInterval(() => {
  if (!stopped) void tick("interval");
}, intervalMs);

async function shutdown(signal: string) {
  stopped = true;
  clearInterval(timer);
  console.log("[form-outreach.automation.worker.stop]", { signal });
  const waitStarted = Date.now();
  while (running && Date.now() - waitStarted < 30_000) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.stdin.resume();
