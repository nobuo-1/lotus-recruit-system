// web/src/worker/email.worker.ts
import "../env";
import { Worker } from "bullmq";
import { redis, type EmailJob, isDirectEmailJob } from "@/server/queue";
import { sendMail } from "@/server/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const admin = supabaseAdmin();

function parseCampaignAndRecipient(source: string | number | undefined) {
  const s = String(source ?? "");
  const m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  return m ? { campaignId: m[1], recipientId: m[2] } : null;
}

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

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

    // ---- Gmail「解除」対応ヘッダー作成（One-Click対応） ----
    const listUnsubscribeUrl = data.unsubscribeToken
      ? `${APP_URL}/unsubscribe?token=${encodeURIComponent(
          data.unsubscribeToken
        )}`
      : `${APP_URL}/unsubscribe`;

    const supportMail =
      (data.brandSupport as string | undefined) || "support@example.com";

    const listHeaders = {
      "List-Unsubscribe": `<${listUnsubscribeUrl}>, <mailto:${supportMail}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    // ---- 送信 ----
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
      // 型の厳しさを避けるため as any（既存 sendMail 定義を崩さずヘッダを渡す）
      headers: listHeaders,
    } as any);

    // ---- DB 更新 ----
    let meta = parseCampaignAndRecipient(job.id);
    if (!meta) {
      meta = parseCampaignAndRecipient(job.name as any);
    }

    if (!meta) {
      console.warn("[email.warn.meta-missing]", {
        jobId: job.id,
        name: job.name,
      });
    } else {
      const nowIso = new Date().toISOString();

      await admin
        .from("deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("campaign_id", meta.campaignId)
        .eq("recipient_id", meta.recipientId);

      await admin // 一覧の見た目用
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
