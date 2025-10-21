// web/src/worker/email.worker.ts
import { Worker } from "bullmq";
import { redis, type EmailJob, isDirectEmailJob } from "@/server/queue";
import { sendMail } from "@/server/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const admin = supabaseAdmin();

/** jobId からキャンペーン/プレーンメールの meta を抽出 */
function parseCampaignAndRecipient(source: string | number | undefined) {
  const s = String(source ?? "");
  const m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  return m ? { campaignId: m[1], recipientId: m[2] } : null;
}
function parseMailAndRecipient(source: string | number | undefined) {
  const s = String(source ?? "");
  const m = s.match(/^mail:([^:]+):rcpt:([^:]+):/);
  return m ? { mailId: m[1], recipientId: m[2] } : null;
}

const worker = new Worker<EmailJob>(
  "email",
  async (job) => {
    const data = job.data as any;

    if (data?.kind === "noop") {
      console.log("[email.noop]", { jobId: job.id });
      return { ok: true, kind: "noop" };
    }
    if (!isDirectEmailJob(data)) {
      console.warn("[email.skip]", { jobId: job.id, kind: data?.kind });
      return { messageId: "skipped", kind: data?.kind ?? "unknown" };
    }

    // 送信（ヘッダーやフッターは mailer.ts / API 側で整備済み）
    const info = await sendMail({
      to: data.to,
      subject: data.subject,
      html: data.html, // プレーンは undefined
      text: data.text,
      unsubscribeToken: data.unsubscribeToken,
      fromOverride: data.fromOverride,
      brandCompany: data.brandCompany,
      brandAddress: data.brandAddress,
      brandSupport: data.brandSupport,
    });

    // ---- DB 更新（キャンペーン or プレーン）----
    const nowIso = new Date().toISOString();

    // キャンペーン（互換）
    let meta =
      parseCampaignAndRecipient(job.id) ||
      parseCampaignAndRecipient(job.name as any);
    if (meta) {
      await admin
        .from("deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("campaign_id", meta.campaignId)
        .eq("recipient_id", meta.recipientId);

      await admin
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", meta.campaignId);

      await admin
        .from("email_schedules")
        .update({ status: "queued" })
        .eq("campaign_id", meta.campaignId)
        .lte("scheduled_at", nowIso)
        .eq("status", "scheduled");
    }

    // プレーンメール
    let pmeta =
      parseMailAndRecipient(job.id) || parseMailAndRecipient(job.name as any);
    if (pmeta) {
      await admin
        .from("mail_deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("mail_id", pmeta.mailId)
        .eq("recipient_id", pmeta.recipientId);

      await admin
        .from("mails")
        .update({ status: "queued" })
        .eq("id", pmeta.mailId);

      await admin
        .from("mail_schedules")
        .update({ status: "queued" })
        .eq("mail_id", pmeta.mailId)
        .lte("scheduled_at", nowIso)
        .eq("status", "scheduled");
    }

    console.log("[email.sent]", {
      to: data.to,
      messageId: info?.messageId,
      jobId: job.id,
      jobName: job.name,
      tenantId: (data as any).tenantId,
    });

    return { messageId: info?.messageId, kind: data.kind };
  },
  {
    connection: redis,
    concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY ?? 5),
    limiter: {
      max: Number(process.env.EMAIL_RATE_MAX ?? 30),
      duration: Number(process.env.EMAIL_RATE_DURATION_MS ?? 60_000),
    },
  }
);

worker.on("completed", (job, result) => {
  console.log("[email.done]", { jobId: job.id, result });
});
worker.on("failed", (job, err) => {
  console.error("[email.fail]", { jobId: job?.id, err: err?.message });
});

process.on("SIGINT", async () => {
  console.log("Shutting down email worker...");
  await worker.close();
  await redis.quit();
  process.exit(0);
});
