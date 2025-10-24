// web/src/server/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const redis = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  }
);

export type DirectEmailJob = {
  kind: "direct_email";
  to: string;
  subject: string;
  html: string;
  text?: string;
  tenantId?: string;
  unsubscribeToken?: string;
  fromOverride?: string;
  brandCompany?: string;
  brandAddress?: string;
  brandSupport?: string;
  deliveryId?: string; // キャンペーン deliveries.id
  mailDeliveryId?: string; // プレーン mail_deliveries.id
  cc?: string;
  attachments?: Array<{ path: string; name: string; mime?: string }>;
};

export type CampaignSendJob = {
  kind: "campaign_send";
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null;
};

/** ▼ 追加：Ops用のジョブ型 */
export type FormOutreachJob = {
  kind: "form_outreach";
  tenantId: string;
  jobId: string; // form_outreach_jobs.id
  channel: "form" | "email";
};

export type JobBoardRunJob = {
  kind: "job_board_run";
  tenantId: string;
  site: string; // 'mynavi' | 'doda' | ...
  runId: string; // job_board_runs.id
};

export type FormOutreachRunJob = {
  kind: "form_outreach_run";
  tenantId: string;
  runId: string; // 下の /api/form-outreach/runs で作るランID
  flow: "crawl" | "send" | "followup";
};

declare module "@/server/queue" {
  // 既存のOpsJobに足してOK（なければ union に追加）
}

export type EmailJob = DirectEmailJob | CampaignSendJob;
export type OpsJob = FormOutreachJob | JobBoardRunJob | FormOutreachRunJob;

export const isCampaignJob = (j: EmailJob): j is CampaignSendJob =>
  j.kind === "campaign_send";
export const isDirectEmailJob = (j: EmailJob): j is DirectEmailJob =>
  j.kind === "direct_email";

/** 既存：メール配信キュー */
export const emailQueue = new Queue<EmailJob>("email", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

/** 追加：スクレイピング/フォーム送信などの運用キュー */
export const opsQueue = new Queue<OpsJob>("ops", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

export default emailQueue;
