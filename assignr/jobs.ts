import type { AssignrSyncJobKind, AssignrSyncJobStatus, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

export type AssignrJobResultItem = {
  key: string;
  success: boolean;
  assignrId?: string;
  message?: string;
};

export async function createAssignrSyncJob(params: {
  organizationId: string;
  kind: AssignrSyncJobKind;
  totalCount: number;
  payload?: Prisma.InputJsonValue;
  createdByAdminId?: string;
}) {
  return prisma.assignrSyncJob.create({
    data: {
      organizationId: params.organizationId,
      kind: params.kind,
      totalCount: params.totalCount,
      payload: params.payload,
      createdByAdminId: params.createdByAdminId,
      status: "PENDING",
    },
  });
}

export async function markAssignrSyncJobRunning(jobId: string) {
  return prisma.assignrSyncJob.update({
    where: { id: jobId },
    data: { status: "RUNNING" },
  });
}

export async function completeAssignrSyncJob(params: {
  jobId: string;
  successCount: number;
  failedCount: number;
  results: AssignrJobResultItem[];
  errorMessage?: string;
}) {
  const status: AssignrSyncJobStatus =
    params.failedCount === 0
      ? "COMPLETED"
      : params.successCount === 0
        ? "FAILED"
        : "PARTIAL";

  return prisma.assignrSyncJob.update({
    where: { id: params.jobId },
    data: {
      status,
      successCount: params.successCount,
      failedCount: params.failedCount,
      results: params.results,
      errorMessage: params.errorMessage,
      completedAt: new Date(),
    },
  });
}

export async function getAssignrSyncJob(jobId: string) {
  return prisma.assignrSyncJob.findUnique({ where: { id: jobId } });
}

export async function recordAssignrAuditLog(params: {
  organizationId: string;
  action: string;
  assignrResource: string;
  assignrResourceId?: string;
  requestSummary?: Prisma.InputJsonValue;
  responseSummary?: Prisma.InputJsonValue;
  success: boolean;
  errorMessage?: string;
  adminUserId?: string;
  syncJobId?: string;
}) {
  return prisma.assignrAuditLog.create({
    data: {
      organizationId: params.organizationId,
      action: params.action,
      assignrResource: params.assignrResource,
      assignrResourceId: params.assignrResourceId,
      requestSummary: params.requestSummary,
      responseSummary: params.responseSummary,
      success: params.success,
      errorMessage: params.errorMessage,
      adminUserId: params.adminUserId,
      syncJobId: params.syncJobId,
    },
  });
}

export async function runAssignrJobChunks<T>(params: {
  items: T[];
  chunkSize?: number;
  handler: (item: T, index: number) => Promise<AssignrJobResultItem>;
}) {
  const chunkSize = params.chunkSize ?? 3;
  const results: AssignrJobResultItem[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (let index = 0; index < params.items.length; index += chunkSize) {
    const chunk = params.items.slice(index, index + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map((item, offset) => params.handler(item, index + offset)),
    );
    for (const result of chunkResults) {
      results.push(result);
      if (result.success) successCount += 1;
      else failedCount += 1;
    }
    if (index + chunkSize < params.items.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return { results, successCount, failedCount };
}
