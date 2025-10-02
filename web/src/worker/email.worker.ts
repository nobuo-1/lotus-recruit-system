// src/worker/email.worker.ts
import "../env";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { sendMail } from "../server/mailer";
import type { EmailJob, DirectEmailJob } from "../server/queue";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  }
);
const admin = supabaseAdmin();

function parseCampaignAndRecipient(jobId: string | number | undefined) {
  const s = String(jobId ?? "");
  const m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  return m ? { campaignId: m[1], recipientId: m[2] } : null;
}

// --- type guard: EmailJob -> DirectEmailJob ---
function isDirectEmail(job: EmailJob): job is DirectEmailJob {
  return job?.kind === "direct_email";
}

const worker = new Worker<EmailJob>(
  "email",
  async (job: Job<EmailJob>) => {
    const payload = job.data;

    // direct_email 以外は安全にスキップ（将来の拡張用）
    if (!isDirectEmail(payload)) {
      console.warn("[email.skip]", {
        jobId: job.id,
        kind: (payload as { kind?: string })?.kind,
      });
      return {
        messageId: "skipped",
        kind: (payload as { kind?: string })?.kind ?? "unknown",
      };
    }

    // --- 実送信（mailer 側でフッター重複を避ける実装済み） ---
    const info = await sendMail({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      unsubscribeToken: payload.unsubscribeToken,
      fromOverride: payload.fromOverride,
      brandCompany: payload.brandCompany,
      brandAddress: payload.brandAddress,
      brandSupport: payload.brandSupport,
    });

    // ジョブIDに campaign/recipient が入っていれば delivery / campaign / email_schedules を更新
    const meta = parseCampaignAndRecipient(job.id);
    if (meta) {
      const nowIso = new Date().toISOString();

      await admin
        .from("deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("campaign_id", meta.campaignId)
        .eq("recipient_id", meta.recipientId);

      // 予約消化後は campaign を queued へ
      await admin
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", meta.campaignId);

      // 期限到来した予約も queued へ
      await admin
        .from("email_schedules")
        .update({ status: "queued" })
        .eq("campaign_id", meta.campaignId)
        .lte("scheduled_at", nowIso)
        .eq("status", "scheduled");
    }

    console.log("[email.sent]", {
      to: payload.to,
      messageId: info.messageId,
      jobId: job.id,
      tenantId: payload.tenantId,
    });

    // 戻り値の型は自由。モニタリング用に messageId と kind を返す
    return { messageId: info.messageId, kind: payload.kind };
  },
  {
    connection,
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY ?? 5),
    limiter: {
      max: Number(process.env.EMAIL_RATE_MAX ?? 30),
      duration: Number(process.env.EMAIL_RATE_DURATION_MS ?? 60_000),
    },
  }
);

worker.on("completed", (job, result) =>
  console.log("[email.done]", { jobId: job.id, result })
);
worker.on("failed", (job, err) =>
  console.error("[email.fail]", { jobId: job?.id, err: err?.message })
);

process.on("SIGINT", async () => {
  console.log("Shutting down email worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});
