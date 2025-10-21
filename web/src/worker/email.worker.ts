// web/src/worker/email.worker.ts
import { Worker } from "bullmq";
import { redis, type EmailJob, isDirectEmailJob } from "@/server/queue";
import { sendMail } from "@/server/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const admin = supabaseAdmin();

/** jobId: camp:CID:rcpt:RID:timestamp → { campaignId, recipientId } */
function parseCampaignAndRecipient(source: string | number | undefined) {
  const s = String(source ?? "");
  const m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  return m ? { campaignId: m[1], recipientId: m[2] } : null;
}

/** jobId: mail:MID:rcpt:RID:timestamp → { mailId, recipientId } */
function parseMailAndRecipient(source: string | number | undefined) {
  const s = String(source ?? "");
  const m = s.match(/^mail:([^:]+):rcpt:([^:]+):/);
  return m ? { mailId: m[1], recipientId: m[2] } : null;
}

const worker = new Worker<EmailJob>(
  "email",
  async (job) => {
    const data = job.data as any;

    // ヘルスチェック
    if (data?.kind === "noop") {
      console.log("[email.noop]", { jobId: job.id });
      return { ok: true, kind: "noop" };
    }

    if (!isDirectEmailJob(data)) {
      console.warn("[email.skip]", { jobId: job.id, kind: data?.kind });
      return { messageId: "skipped", kind: data?.kind ?? "unknown" };
    }

    // 送信（解除ヘッダーやフッターは mailer.ts に集約）
    const info = await sendMail({
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text,
      unsubscribeToken: data.unsubscribeToken,
      fromOverride: data.fromOverride,
      brandCompany: data.brandCompany,
      brandAddress: data.brandAddress,
      brandSupport: data.brandSupport,
      cc: data.cc || undefined, // ← 追加
      attachments: (data as any).attachments
        ? (data as any).attachments.map((a: any) => ({
            filename: a.name,
            path: a.path,
            contentType: a.mime,
          }))
        : undefined,
    });

    // ---- DB 更新 ----
    const nowIso = new Date().toISOString();

    const metaCamp =
      parseCampaignAndRecipient(job.id) || parseCampaignAndRecipient(job.name);
    const metaMail =
      parseMailAndRecipient(job.id) || parseMailAndRecipient(job.name);

    if (metaCamp) {
      // キャンペーン（既存ロジックを維持）
      await admin
        .from("deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("campaign_id", metaCamp.campaignId)
        .eq("recipient_id", metaCamp.recipientId);

      await admin // 一覧の見た目用
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", metaCamp.campaignId);

      await admin
        .from("email_schedules")
        .update({ status: "queued" })
        .eq("campaign_id", metaCamp.campaignId)
        .lte("scheduled_at", nowIso)
        .eq("status", "scheduled");
    } else if (metaMail) {
      // プレーンメール（今回追加）
      await admin
        .from("mail_deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("mail_id", metaMail.mailId)
        .eq("recipient_id", metaMail.recipientId);

      await admin
        .from("mail_schedules")
        .update({ status: "queued" })
        .eq("mail_id", metaMail.mailId)
        .lte("schedule_at", nowIso)
        .eq("status", "scheduled");
    } else {
      console.warn("[email.warn.meta-missing]", {
        jobId: job.id,
        name: job.name,
      });
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
