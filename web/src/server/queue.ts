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
  deliveryId?: string;
  cc?: string;
  attachments?: Array<{ path: string; name: string; mime?: string }>;
};

export type CampaignSendJob = {
  kind: "campaign_send";
  campaignId: string;
  recipientIds: string[];
  scheduleAt?: string | null;
};

export type EmailJob = DirectEmailJob | CampaignSendJob;

export const isCampaignJob = (j: EmailJob): j is CampaignSendJob =>
  j.kind === "campaign_send";
export const isDirectEmailJob = (j: EmailJob): j is DirectEmailJob =>
  j.kind === "direct_email";

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
