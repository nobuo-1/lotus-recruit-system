// src/worker/email.worker.ts
/**
 * BullMQ のワーカー。Vercel（サーバーレス）では常駐不可のため、
 * RUN_EMAIL_WORKER=1 のときのみ起動します。
 * フッターは mailer 側で「1回だけ」注入するため、ここでは足しません。
 */
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { sendMail } from "@/server/mailer";
import type { DirectEmailJob } from "@/server/queue";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUEUE_NAME = process.env.EMAIL_QUEUE_NAME || "email";
const RUN = process.env.RUN_EMAIL_WORKER === "1";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

type Meta = { campaignId: string; recipientId: string };

function parseCampaignAndRecipient(
  jobId: string | number | undefined
): Meta | null {
  const s = String(jobId ?? "");
  const m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  return m ? { campaignId: m[1], recipientId: m[2] } : null;
}

export function startEmailWorker() {
  if (!RUN || !REDIS_URL) return null;

  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  const admin = supabaseAdmin();

  // DirectEmailJob をジェネリクスで指定（any を使わない）
  const worker = new Worker<DirectEmailJob>(
    QUEUE_NAME,
    async (job: Job<DirectEmailJob>) => {
      // 実送信（mailer 側でフッター/解除導線を注入）
      const info = await sendMail(job.data);

      // ジョブIDに campaign/recipient が入っていれば DB を更新
      const meta = parseCampaignAndRecipient(job.id);
      if (meta) {
        const nowIso = new Date().toISOString();

        // 1) deliveries: sent に更新
        await admin
          .from("deliveries")
          .update({ status: "sent", sent_at: nowIso })
          .eq("campaign_id", meta.campaignId)
          .eq("recipient_id", meta.recipientId);

        // 2) campaigns: scheduled → queued（予約消化後）
        await admin
          .from("campaigns")
          .update({ status: "queued" })
          .eq("id", meta.campaignId);

        // 3) email_schedules: 期限到来した予約は queued へ
        await admin
          .from("email_schedules")
          .update({ status: "queued" })
          .eq("campaign_id", meta.campaignId)
          .lte("scheduled_at", nowIso)
          .eq("status", "scheduled");
      }

      // eslint-disable-next-line no-console
      console.log("[email.sent]", {
        to: job.data.to,
        messageId: info.messageId,
        jobId: job.id,
        tenantId: job.data.tenantId,
      });

      return { messageId: info.messageId, kind: "direct_email" as const };
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

  worker.on("completed", (job, result) => {
    // eslint-disable-next-line no-console
    console.log("[email.done]", { jobId: job.id, result });
  });
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error("[email.fail]", { jobId: job?.id, err: err?.message });
  });

  if (typeof process !== "undefined") {
    process.on("SIGINT", async () => {
      // eslint-disable-next-line no-console
      console.log("Shutting down email worker...");
      await worker.close();
      await connection.quit();
      process.exit(0);
    });
  }

  return worker;
}

// ローカル/常駐環境で自動起動（Vercel 等では RUN=1 を付けない）
if (RUN) {
  startEmailWorker();
}
