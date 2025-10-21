// web/src/worker/email.worker.ts
import { Worker } from "bullmq";
import { redis, type EmailJob, isDirectEmailJob } from "@/server/queue";
import { sendMail } from "@/server/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const admin = supabaseAdmin();

/** jobId / job.name から meta を抽出 */
function parseJobMeta(
  source: string | number | undefined
):
  | { kind: "campaign"; campaignId: string; recipientId: string }
  | { kind: "mail"; mailId: string; recipientId: string }
  | null {
  const s = String(source ?? "");
  let m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  if (m) return { kind: "campaign", campaignId: m[1], recipientId: m[2] };
  m = s.match(/^mail:([^:]+):rcpt:([^:]+):/);
  if (m) return { kind: "mail", mailId: m[1], recipientId: m[2] };
  return null;
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

    // 送信
    const info = await sendMail({
      to: data.to,
      subject: data.subject,
      html: data.html, // ← undefined 可
      text: data.text,
      unsubscribeToken: data.unsubscribeToken,
      fromOverride: data.fromOverride,
      brandCompany: data.brandCompany,
      brandAddress: data.brandAddress,
      brandSupport: data.brandSupport,
    });

    // メタ取得（id または name）
    let meta = parseJobMeta(job.id);
    if (!meta) meta = parseJobMeta(job.name as any);

    const nowIso = new Date().toISOString();

    if (!meta) {
      console.warn("[email.warn.meta-missing]", {
        jobId: job.id,
        name: job.name,
      });
    } else if (meta.kind === "campaign") {
      // 既存：キャンペーン
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
    } else {
      // 新規：プレーンメール
      await admin
        .from("mail_deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("mail_id", meta.mailId)
        .eq("recipient_id", meta.recipientId);

      await admin
        .from("mails")
        .update({ status: "queued" })
        .eq("id", meta.mailId);

      // ※ mail_schedules のカラムは schedule_at
      await admin
        .from("mail_schedules")
        .update({ status: "queued" })
        .eq("mail_id", meta.mailId)
        .lte("schedule_at", nowIso)
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
