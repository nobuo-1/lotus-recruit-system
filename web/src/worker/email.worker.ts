// web/src/worker/email.worker.ts
import { Worker } from "bullmq";
import { redis, type EmailJob, isDirectEmailJob } from "@/server/queue";
import { sendMail } from "@/server/mailer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const admin = supabaseAdmin();

/** jobId から meta を抽出する
 *  - キャンペーン: camp:<CID>:rcpt:<RID>:<ts>
 *  - プレーン   : mail:<MID>:rcpt:<RID>:<ts>
 */
function parseMeta(
  source: string | number | undefined
):
  | { type: "campaign"; campaignId: string; recipientId: string }
  | { type: "mail"; mailId: string; recipientId: string }
  | null {
  const s = String(source ?? "");
  let m = s.match(/^camp:([^:]+):rcpt:([^:]+):/);
  if (m) return { type: "campaign", campaignId: m[1], recipientId: m[2] };
  m = s.match(/^mail:([^:]+):rcpt:([^:]+):/);
  if (m) return { type: "mail", mailId: m[1], recipientId: m[2] };
  return null;
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

    // 送信（解除ヘッダー等は mailer.ts に集約）
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
    });

    // ---- DB 更新（キャンペーン / プレーンを分岐）----
    let meta = parseMeta(job.id);
    if (!meta) meta = parseMeta(job.name as any);

    const nowIso = new Date().toISOString();

    if (!meta) {
      console.warn("[email.warn.meta-missing]", {
        jobId: job.id,
        name: job.name,
      });
    } else if (meta.type === "campaign") {
      // deliveries（キャンペーン）
      await admin
        .from("deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("campaign_id", meta.campaignId)
        .eq("recipient_id", meta.recipientId);

      // 見た目用：キャンペーン本体は queued に寄せる（既存仕様踏襲）
      await admin
        .from("campaigns")
        .update({ status: "queued" })
        .eq("id", meta.campaignId);

      // email_schedules：実行済みにする（scheduled → queued）
      await admin
        .from("email_schedules")
        .update({ status: "queued" })
        .eq("campaign_id", meta.campaignId)
        .lte("scheduled_at", nowIso)
        .eq("status", "scheduled");
    } else if (meta.type === "mail") {
      // mail_deliveries（プレーンメール）
      await admin
        .from("mail_deliveries")
        .update({ status: "sent", sent_at: nowIso })
        .eq("mail_id", meta.mailId)
        .eq("recipient_id", meta.recipientId);

      // mails 本体の見た目用：queued に寄せる
      await admin
        .from("mails")
        .update({ status: "queued" })
        .eq("id", meta.mailId);

      // mail_schedules：実行済みにする（scheduled → queued）
      await admin
        .from("mail_schedules")
        .update({ status: "queued" })
        .eq("mail_id", meta.mailId)
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
