import "server-only";

import prisma from "@/lib/prisma";
import { normalizeLooseName } from "@/app/api/admin/teams/import/route";
import type {
  PlayerNameCollisionEnrollmentRow,
  PlayerNameCollisionFinding,
  PlayerNameCollisionFindingType,
  PlayerNameCollisionReport,
  PlayerNameCollisionTeamPlayerRow,
} from "./types";

/**
 * Two distinct symptoms, both surfaced by grouping same-name rows within a
 * division:
 *
 *  - COLLAPSED_REGISTRATION: Enrollment (one row per real SportsConnect
 *    registration, keyed by orderNo/DOB -- see deriveSportsConnectRowKey in
 *    app/api/admin/teams/import/route.ts, so it does NOT suffer this) has
 *    more rows for a name than TeamPlayer does. Two real kids' registrations
 *    likely got matched to the same roster row on import (the bug the
 *    Player ID identity fix in lib/sportsConnect/playerIdentity.ts
 *    prevents going forward; this finds it in data imported before that).
 *  - DUPLICATE_ROSTER_ROW: TeamPlayer itself has 2+ rows sharing a name in
 *    one division -- likely the same real kid duplicated.
 */
function fieldToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function getPlayerNameCollisionReport(params: {
  organizationId: string;
  seasonYear: number;
}): Promise<PlayerNameCollisionReport> {
  const { organizationId, seasonYear } = params;

  const [enrollments, teamPlayers] = await Promise.all([
    prisma.enrollment.findMany({
      where: { organizationId, seasonYear },
      select: {
        id: true,
        fullName: true,
        ageGroup: true,
        guardianEmail: true,
        guardianPhone: true,
        birthDate: true,
        sportsConnectOrderNo: true,
        sportsConnectPlayerId: true,
        teamNameRaw: true,
      },
    }),
    prisma.teamPlayer.findMany({
      where: { team: { organizationId, seasonYear } },
      select: {
        id: true,
        fullName: true,
        guardianEmail: true,
        guardianPhone: true,
        birthDate: true,
        sportsConnectPlayerId: true,
        teamId: true,
        team: { select: { ageGroup: true, teamName: true } },
      },
    }),
  ]);

  type GroupKey = string; // `${ageGroup}::${normalizedName}`
  const enrollmentGroups = new Map<GroupKey, typeof enrollments>();
  for (const e of enrollments) {
    const key: GroupKey = `${e.ageGroup}::${normalizeLooseName(e.fullName)}`;
    const list = enrollmentGroups.get(key);
    if (list) list.push(e);
    else enrollmentGroups.set(key, [e]);
  }

  const teamPlayerGroups = new Map<GroupKey, typeof teamPlayers>();
  for (const p of teamPlayers) {
    const key: GroupKey = `${p.team.ageGroup}::${normalizeLooseName(p.fullName)}`;
    const list = teamPlayerGroups.get(key);
    if (list) list.push(p);
    else teamPlayerGroups.set(key, [p]);
  }

  const allKeys = new Set<GroupKey>([...enrollmentGroups.keys(), ...teamPlayerGroups.keys()]);
  const candidateFindings: Array<{ key: GroupKey; ageGroup: string; normalizedName: string; findingType: PlayerNameCollisionFindingType }> = [];
  for (const key of allKeys) {
    const [ageGroup, normalizedName] = key.split("::");
    const enrollmentList = enrollmentGroups.get(key) ?? [];
    const teamPlayerList = teamPlayerGroups.get(key) ?? [];
    if (enrollmentList.length > teamPlayerList.length) {
      candidateFindings.push({ key, ageGroup, normalizedName, findingType: "COLLAPSED_REGISTRATION" });
    }
    if (teamPlayerList.length > 1) {
      candidateFindings.push({ key, ageGroup, normalizedName, findingType: "DUPLICATE_ROSTER_ROW" });
    }
  }

  if (candidateFindings.length === 0) {
    return { organizationId, seasonYear, findings: [] };
  }

  const reviews = await prisma.playerNameCollisionReview.findMany({
    where: {
      organizationId,
      seasonYear,
      OR: candidateFindings.map((c) => ({ ageGroup: c.ageGroup, normalizedName: c.normalizedName, findingType: c.findingType })),
    },
  });
  const reviewByKey = new Map(
    reviews.map((r) => [`${r.ageGroup}::${r.normalizedName}::${r.findingType}`, r]),
  );

  const findings: PlayerNameCollisionFinding[] = [];
  for (const candidate of candidateFindings) {
    const enrollmentList = enrollmentGroups.get(candidate.key) ?? [];
    const teamPlayerList = teamPlayerGroups.get(candidate.key) ?? [];
    const currentEnrollmentIds = enrollmentList.map((e) => e.id).sort();
    const currentTeamPlayerIds = teamPlayerList.map((p) => p.id).sort();

    const review = reviewByKey.get(`${candidate.ageGroup}::${candidate.normalizedName}::${candidate.findingType}`);
    if (review && review.status !== "OPEN") {
      const sameEnrollments =
        JSON.stringify(review.reviewedEnrollmentIds.slice().sort()) === JSON.stringify(currentEnrollmentIds);
      const sameTeamPlayers =
        JSON.stringify(review.reviewedTeamPlayerIds.slice().sort()) === JSON.stringify(currentTeamPlayerIds);
      if (sameEnrollments && sameTeamPlayers) continue; // reviewed, nothing changed since -- suppress
    }

    const enrollmentRows: PlayerNameCollisionEnrollmentRow[] = enrollmentList.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      guardianEmail: e.guardianEmail,
      guardianPhone: e.guardianPhone,
      birthDate: fieldToIso(e.birthDate),
      sportsConnectOrderNo: e.sportsConnectOrderNo,
      sportsConnectPlayerId: e.sportsConnectPlayerId,
      teamNameRaw: e.teamNameRaw,
    }));
    const teamPlayerRows: PlayerNameCollisionTeamPlayerRow[] = teamPlayerList.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      guardianEmail: p.guardianEmail,
      guardianPhone: p.guardianPhone,
      birthDate: fieldToIso(p.birthDate),
      sportsConnectPlayerId: p.sportsConnectPlayerId,
      teamId: p.teamId,
      teamName: p.team.teamName,
    }));

    findings.push({
      organizationId,
      seasonYear,
      ageGroup: candidate.ageGroup,
      normalizedName: candidate.normalizedName,
      findingType: candidate.findingType,
      enrollmentRows,
      teamPlayerRows,
    });
  }

  findings.sort((a, b) => a.ageGroup.localeCompare(b.ageGroup) || a.normalizedName.localeCompare(b.normalizedName));
  return { organizationId, seasonYear, findings };
}

export async function countOpenPlayerNameCollisions(params: {
  organizationId: string;
  seasonYear: number;
}): Promise<number> {
  const report = await getPlayerNameCollisionReport(params);
  return report.findings.length;
}

async function snapshotAndUpsertReview(params: {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  normalizedName: string;
  findingType: PlayerNameCollisionFindingType;
  status: "DISMISSED" | "RESOLVED";
  reviewedByAdminId: string | null;
  resolutionNote?: string | null;
}) {
  const { organizationId, seasonYear, ageGroup, normalizedName, findingType } = params;
  const [enrollmentIds, teamPlayerIds] = await Promise.all([
    prisma.enrollment
      .findMany({ where: { organizationId, seasonYear, ageGroup }, select: { id: true, fullName: true } })
      .then((rows) => rows.filter((r) => normalizeLooseName(r.fullName) === normalizedName).map((r) => r.id).sort()),
    prisma.teamPlayer
      .findMany({
        where: { team: { organizationId, seasonYear, ageGroup } },
        select: { id: true, fullName: true },
      })
      .then((rows) => rows.filter((r) => normalizeLooseName(r.fullName) === normalizedName).map((r) => r.id).sort()),
  ]);

  await prisma.playerNameCollisionReview.upsert({
    where: {
      organizationId_seasonYear_ageGroup_normalizedName_findingType: {
        organizationId,
        seasonYear,
        ageGroup,
        normalizedName,
        findingType,
      },
    },
    create: {
      organizationId,
      seasonYear,
      ageGroup,
      normalizedName,
      findingType,
      status: params.status,
      reviewedTeamPlayerIds: teamPlayerIds,
      reviewedEnrollmentIds: enrollmentIds,
      reviewedByAdminId: params.reviewedByAdminId,
      reviewedAt: new Date(),
      resolutionNote: params.resolutionNote ?? null,
    },
    update: {
      status: params.status,
      reviewedTeamPlayerIds: teamPlayerIds,
      reviewedEnrollmentIds: enrollmentIds,
      reviewedByAdminId: params.reviewedByAdminId,
      reviewedAt: new Date(),
      resolutionNote: params.resolutionNote ?? null,
    },
  });
}

export async function dismissPlayerNameCollision(params: {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  normalizedName: string;
  findingType: PlayerNameCollisionFindingType;
  adminId: string | null;
}): Promise<void> {
  await snapshotAndUpsertReview({ ...params, status: "DISMISSED", reviewedByAdminId: params.adminId });
}

/** Fields coalesced from the loser onto the survivor -- only where the survivor's own value is null, never overwriting a populated value. */
const MERGE_COALESCE_FIELDS = [
  "firstName",
  "lastName",
  "contactPhone",
  "gender",
  "birthDate",
  "guardianFirstName",
  "guardianLastName",
  "guardianEmail",
  "guardianPhone",
  "paymentStatus",
  "birthCertificateStatus",
  "registrationOrderNo",
  "registrationOrderDate",
  "jerseySize",
  "medicalConditionsSummary",
  "medicalConditionsDetails",
  "medicalTreatmentAuthorized",
  "liabilityWaiverAccepted",
  "codeOfConductAccepted",
  "refundPolicyAccepted",
  "playedPriorSeason",
  "priorSeasonTeamInfo",
  "streetAddress",
  "unit",
  "city",
  "state",
  "postalCode",
  "rosterStatus",
  "jerseyNumber",
  "allStarAgeBand",
  "sportsConnectPlayerId",
] as const;

export async function mergeTeamPlayers(params: {
  survivorTeamPlayerId: string;
  loserTeamPlayerId: string;
  adminId: string | null;
}): Promise<{ survivorId: string }> {
  const [survivor, loser] = await Promise.all([
    prisma.teamPlayer.findUnique({ where: { id: params.survivorTeamPlayerId }, include: { team: true } }),
    prisma.teamPlayer.findUnique({ where: { id: params.loserTeamPlayerId }, include: { team: true } }),
  ]);
  if (!survivor || !loser) throw new Error("Both players must exist to merge.");
  if (survivor.team.organizationId !== loser.team.organizationId || survivor.team.seasonYear !== loser.team.seasonYear) {
    throw new Error("Cannot merge players from different organizations/seasons.");
  }

  const updateData: Record<string, unknown> = {};
  for (const field of MERGE_COALESCE_FIELDS) {
    const survivorValue = (survivor as Record<string, unknown>)[field];
    const loserValue = (loser as Record<string, unknown>)[field];
    if (survivorValue == null && loserValue != null) {
      updateData[field] = loserValue;
    }
  }

  const ageGroup = survivor.team.ageGroup;
  const normalizedName = normalizeLooseName(survivor.fullName);

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.teamPlayer.update({ where: { id: survivor.id }, data: updateData });
    }
    await tx.teamPlayer.delete({ where: { id: loser.id } });
  });

  await snapshotAndUpsertReview({
    organizationId: survivor.team.organizationId,
    seasonYear: survivor.team.seasonYear,
    ageGroup,
    normalizedName,
    findingType: "DUPLICATE_ROSTER_ROW",
    status: "RESOLVED",
    reviewedByAdminId: params.adminId,
    resolutionNote: `Merged ${loser.id} into ${survivor.id}`,
  });

  return { survivorId: survivor.id };
}

export async function createMissingTeamPlayerFromEnrollment(params: {
  enrollmentId: string;
  teamId?: string | null;
  adminId: string | null;
}): Promise<{ teamPlayerId: string }> {
  const enrollment = await prisma.enrollment.findUnique({ where: { id: params.enrollmentId } });
  if (!enrollment) throw new Error("Enrollment row not found.");

  let teamId = params.teamId || enrollment.teamId;
  if (!teamId) {
    const fallbackTeam = await prisma.team.findFirst({
      where: {
        organizationId: enrollment.organizationId,
        seasonYear: enrollment.seasonYear,
        ageGroup: enrollment.ageGroup,
        teamName: { equals: "Unallocated", mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!fallbackTeam) {
      throw new Error("No team specified and no 'Unallocated' placeholder team exists for this division.");
    }
    teamId = fallbackTeam.id;
  }

  const created = await prisma.teamPlayer.create({
    data: {
      teamId,
      firstName: enrollment.firstName,
      lastName: enrollment.lastName,
      fullName: enrollment.fullName,
      contactPhone: enrollment.contactPhone,
      gender: enrollment.gender,
      birthDate: enrollment.birthDate,
      guardianFirstName: enrollment.guardianFirstName,
      guardianLastName: enrollment.guardianLastName,
      guardianEmail: enrollment.guardianEmail,
      guardianPhone: enrollment.guardianPhone,
      paymentStatus: enrollment.orderPaymentStatus,
      registrationOrderNo: enrollment.sportsConnectOrderNo,
      registrationOrderDate: enrollment.orderDate,
      streetAddress: enrollment.streetAddress,
      unit: enrollment.unit,
      city: enrollment.city,
      state: enrollment.state,
      postalCode: enrollment.postalCode,
      sportsConnectPlayerId: enrollment.sportsConnectPlayerId,
    },
  });

  await snapshotAndUpsertReview({
    organizationId: enrollment.organizationId,
    seasonYear: enrollment.seasonYear,
    ageGroup: enrollment.ageGroup,
    normalizedName: normalizeLooseName(enrollment.fullName),
    findingType: "COLLAPSED_REGISTRATION",
    status: "RESOLVED",
    reviewedByAdminId: params.adminId,
    resolutionNote: `Created TeamPlayer ${created.id} from Enrollment ${enrollment.id}`,
  });

  return { teamPlayerId: created.id };
}
