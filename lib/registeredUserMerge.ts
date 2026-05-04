import type { PrismaClient } from "@prisma/client";

import { PROTECTED_MASTER_ADMIN_EMAIL } from "@/lib/auth/adminRoles";

export type MergeRegisteredUsersParams = {
  keepUserId: string;
  mergeUserId: string;
  organizationId: string;
};

/**
 * Moves all foreign keys from `mergeUserId` onto `keepUserId`, merges login fields,
 * deletes `mergeUserId`. Both users must belong to `organizationId`.
 */
export async function mergeRegisteredUsers(
  prisma: PrismaClient,
  params: MergeRegisteredUsersParams,
) {
  const { keepUserId, mergeUserId, organizationId } = params;
  if (keepUserId === mergeUserId) {
    throw new Error("Cannot merge a user into itself");
  }

  const [keep, merge] = await Promise.all([
    prisma.registeredUser.findUnique({ where: { id: keepUserId } }),
    prisma.registeredUser.findUnique({ where: { id: mergeUserId } }),
  ]);

  if (!keep || !merge) {
    throw new Error("User not found");
  }
  if (keep.organizationId !== organizationId || merge.organizationId !== organizationId) {
    throw new Error("Users must belong to the selected organization");
  }

  const mergeEmail = merge.email.trim().toLowerCase();
  if (mergeEmail === PROTECTED_MASTER_ADMIN_EMAIL.toLowerCase()) {
    throw new Error(
      "Cannot merge away the protected master account. Merge the duplicate account into that user instead.",
    );
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.coachSession.updateMany({
        where: { userId: mergeUserId },
        data: { userId: keepUserId },
      });

      await tx.dugoutPost.updateMany({
        where: { authorId: mergeUserId },
        data: { authorId: keepUserId },
      });

      await tx.dugoutComment.updateMany({
        where: { authorId: mergeUserId },
        data: { authorId: keepUserId },
      });

      const likes = await tx.dugoutPostLike.findMany({
        where: { userId: mergeUserId },
      });
      for (const like of likes) {
        const dup = await tx.dugoutPostLike.findFirst({
          where: {
            postId: like.postId,
            userId: keepUserId,
          },
        });
        if (dup) {
          await tx.dugoutPostLike.delete({ where: { id: like.id } });
        } else {
          await tx.dugoutPostLike.update({
            where: { id: like.id },
            data: { userId: keepUserId },
          });
        }
      }

      const mergeCursor = await tx.dugoutNotificationCursor.findUnique({
        where: { userId: mergeUserId },
      });
      if (mergeCursor) {
        const keepCursor = await tx.dugoutNotificationCursor.findUnique({
          where: { userId: keepUserId },
        });
        if (keepCursor) {
          await tx.dugoutNotificationCursor.delete({
            where: { userId: mergeUserId },
          });
        } else {
          await tx.dugoutNotificationCursor.update({
            where: { userId: mergeUserId },
            data: { userId: keepUserId },
          });
        }
      }

      const mergeReads = await tx.dugoutNotificationRead.findMany({
        where: { userId: mergeUserId },
      });
      for (const read of mergeReads) {
        let conflict = null;
        if (read.postLikeId) {
          conflict = await tx.dugoutNotificationRead.findUnique({
            where: {
              userId_postLikeId: {
                userId: keepUserId,
                postLikeId: read.postLikeId,
              },
            },
          });
        } else if (read.commentId) {
          conflict = await tx.dugoutNotificationRead.findUnique({
            where: {
              userId_commentId: {
                userId: keepUserId,
                commentId: read.commentId,
              },
            },
          });
        }
        if (conflict) {
          await tx.dugoutNotificationRead.delete({ where: { id: read.id } });
        } else {
          await tx.dugoutNotificationRead.update({
            where: { id: read.id },
            data: { userId: keepUserId },
          });
        }
      }

      const mergeDrafts = await tx.allStarVoteDraft.findMany({
        where: { coachUserId: mergeUserId },
      });
      for (const d of mergeDrafts) {
        const conflict = await tx.allStarVoteDraft.findUnique({
          where: {
            ballotCycleId_coachUserId: {
              ballotCycleId: d.ballotCycleId,
              coachUserId: keepUserId,
            },
          },
        });
        if (conflict) {
          await tx.allStarVoteDraft.delete({ where: { id: d.id } });
        } else {
          await tx.allStarVoteDraft.update({
            where: { id: d.id },
            data: { coachUserId: keepUserId },
          });
        }
      }

      const mergeSubs = await tx.allStarVoteSubmission.findMany({
        where: { coachUserId: mergeUserId },
      });
      for (const s of mergeSubs) {
        const conflict = await tx.allStarVoteSubmission.findUnique({
          where: {
            ballotCycleId_coachUserId: {
              ballotCycleId: s.ballotCycleId,
              coachUserId: keepUserId,
            },
          },
        });
        if (conflict) {
          await tx.allStarVoteSubmission.delete({ where: { id: s.id } });
        } else {
          await tx.allStarVoteSubmission.update({
            where: { id: s.id },
            data: { coachUserId: keepUserId },
          });
        }
      }

      await tx.allStarHeadCoachAssignment.updateMany({
        where: { registeredUserId: mergeUserId },
        data: { registeredUserId: keepUserId },
      });

      await tx.allStarInvite.updateMany({
        where: { invitedUserId: mergeUserId },
        data: { invitedUserId: keepUserId },
      });

      const mergeVaultRows = await tx.allStarVaultAccess.findMany({
        where: { registeredUserId: mergeUserId },
      });
      for (const row of mergeVaultRows) {
        const keepRow = await tx.allStarVaultAccess.findUnique({
          where: {
            registeredUserId_organizationId: {
              registeredUserId: keepUserId,
              organizationId: row.organizationId,
            },
          },
        });
        if (keepRow) {
          await tx.allStarVaultAccess.delete({ where: { id: row.id } });
        } else {
          await tx.allStarVaultAccess.update({
            where: { id: row.id },
            data: { registeredUserId: keepUserId },
          });
        }
      }

      const mergeCoachAssign = await tx.teamCoachAssignment.findMany({
        where: { registeredUserId: mergeUserId },
      });
      for (const a of mergeCoachAssign) {
        const conflict = await tx.teamCoachAssignment.findUnique({
          where: {
            teamId_registeredUserId: {
              teamId: a.teamId,
              registeredUserId: keepUserId,
            },
          },
        });
        if (conflict) {
          await tx.teamCoachAssignment.delete({ where: { id: a.id } });
        } else {
          await tx.teamCoachAssignment.update({
            where: { id: a.id },
            data: { registeredUserId: keepUserId },
          });
        }
      }

      await tx.teamGameNote.updateMany({
        where: { authoredByUserId: mergeUserId },
        data: { authoredByUserId: keepUserId },
      });

      await tx.adminAuditLog.updateMany({
        where: { targetRegisteredUserId: mergeUserId },
        data: { targetRegisteredUserId: keepUserId },
      });

      await tx.registeredUser.update({
        where: { id: keepUserId },
        data: {
          googleSub: keep.googleSub ?? merge.googleSub,
          passwordHash: keep.passwordHash ?? merge.passwordHash,
          avatarUrl: keep.avatarUrl ?? merge.avatarUrl,
          contactPhone: keep.contactPhone ?? merge.contactPhone,
          firstName: keep.firstName ?? merge.firstName,
          lastName: keep.lastName ?? merge.lastName,
          name: keep.name ?? merge.name,
          ageGroup: keep.ageGroup ?? merge.ageGroup,
          assignedTeam: keep.assignedTeam ?? merge.assignedTeam,
          isCoach: keep.isCoach || merge.isCoach,
        },
      });

      await tx.registeredUser.delete({ where: { id: mergeUserId } });
    },
    { maxWait: 30000, timeout: 120000 },
  );
}
