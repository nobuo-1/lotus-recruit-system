// web/src/server/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

/** BullMQ 要件: maxRetriesPerRequest は null。enableReadyCheck は任意で維持 */
export const redis = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Upstashなど rediss:// の場合は TLS を自動有効化
    tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  }
);

/** これまで使っていた単発メール送信用のジョブ */
export type DirectEmailJob = {
  kind: "direct_email"; // ← 判別キー
  to: string;
  subject: string;
  html: string;
  text?: string;
  tenantId?: string;
  unsubscribeToken?: string;

  // 追加：ブランド/From
  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
  deliveryId?: string;
};

/** 追加：キャンペーンの一括送信用ジョブ */
export type CampaignSendJob = {
  kind: "campaign_send"; // ← 判別キー
  campaignId: string; // 配信するキャンペーンID
  recipientIds: string[]; // 対象の受信者ID配列
  scheduleAt?: string | null; // 予約ISO（情報用。実際の遅延は delay で制御）
};

/** キューが受け付けるジョブの総称（判別可能ユニオン） */
export type EmailJob = DirectEmailJob | CampaignSendJob;

/** 型ガード（ワーカー側で利用） */
export const isCampaignJob = (j: EmailJob): j is CampaignSendJob =>
  j.kind === "campaign_send";
export const isDirectEmailJob = (j: EmailJob): j is DirectEmailJob =>
  j.kind === "direct_email";

/** 既存の設定を維持したまま、型だけユニオンに */
export const emailQueue = new Queue<EmailJob>("email", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

export default emailQueue;
