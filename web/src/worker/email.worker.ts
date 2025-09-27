import "../env";
import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { sendMail } from "../server/mailer";
import type { EmailJob } from "../server/queue";
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

const worker = new Worker<EmailJob>(
  "email",
  async (job: Job<EmailJob>) => {
    const data: any = job.data;

    // --- ここでフッターを付与（設定があれば） ---
    if (data?.html) {
      const lines: string[] = [];
      if (data.brandCompany) lines.push(`<div>${data.brandCompany}</div>`);
      if (data.brandAddress) lines.push(`<div>${data.brandAddress}</div>`);
      if (data.brandSupport)
        lines.push(`<div>お問い合わせ: ${data.brandSupport}</div>`);
      if (data.unsubscribeToken)
        lines.push(
          `<div style="margin-top:8px;font-size:12px;color:#666">
             配信停止: {{UNSUB_URL}}
           </div>`
        );
      if (lines.length) {
        const footer = `<hr style="margin:16px 0;border:none;border-top:1px solid #eee" />${lines.join(
          ""
        )}`;
        data.html = `${data.html}${footer}`;
      }
    }

    // 実送信
    const info = await sendMail(data);

    // ジョブIDに campaign/recipient が入っていれば delivery と campaign/email_schedules を更新
    const meta = parseCampaignAndRecipient(job.id);
    if (meta) {
      const nowIso = new Date().toISOString();

      // 送信済みに
      await admin
        .from("deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("campaign_id", meta.campaignId)
        .eq("recipient_id", meta.recipientId);

      // 予約が走ったタイミングでキャンペーンを queued に（scheduled → queued）
      await admin
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", meta.campaignId);

      // 予約一覧からは消しつつ状態も揃える（同キャンペーンで期限の来た予約を queued）
      await admin
        .from("email_schedules")
        .update({ status: "queued" })
        .eq("campaign_id", meta.campaignId)
        .lte("scheduled_at", nowIso)
        .eq("status", "scheduled");
    }

    console.log("[email.sent]", {
      to: data && "to" in data ? data.to : undefined,
      messageId: info.messageId,
      jobId: job.id,
      tenantId: data?.tenantId,
    });
    return { messageId: info.messageId, kind: "direct_email" };
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
