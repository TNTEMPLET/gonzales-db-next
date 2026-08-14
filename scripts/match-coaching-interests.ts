import fs from "fs";
import path from "path";
import dotenv from "dotenv";

if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}

import { PrismaClient, CoachingInterestStatus } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";
import { driveV3Request, getDriveAccessToken } from "../lib/google/driveServiceAccount";
import XLSX from "xlsx";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("NO DATABASE_URL");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: createDatabaseAdapter(connectionString),
});

function normalizeName(str: string | null | undefined): string {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeEmail(str: string | null | undefined): string {
  return String(str || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(str: string | null | undefined): string {
  return String(str || "").replace(/\D/g, "");
}

async function listFolderFiles(folderId: string) {
  const query = `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const pathAndQuery = `/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,md5Checksum,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await driveV3Request<any>(pathAndQuery);
  if (!res.ok) {
    throw new Error(`Google Drive API error (${res.status}): ${res.message}`);
  }
  return (res.data.files || []) as Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
  }>;
}

async function run() {
  console.log("=== Matching Coaching Interests against Volunteer File ===");

  // 1. Fetch Fall Ball coaching interests
  const interests = await prisma.coachingInterestSubmission.findMany({
    where: { organizationId: "fallball" },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\nFound ${interests.length} Coaching Interest Submissions for Fall Ball:`);

  // 2. Fetch files from Google Drive folder
  const folderId = "1D8BfDLxXY1pCxwSJPmjiXhK1LczcDQNC";
  const files = await listFolderFiles(folderId);
  console.log(`\nFound ${files.length} file(s) in Google Drive folder (${folderId}):`);
  for (const f of files) {
    console.log(`  - File: "${f.name}" (ID: ${f.id}, Size: ${f.size || "unknown"})`);
  }

  const volFile = files.find(
    (f) =>
      f.name.toLowerCase().includes("volunteer") ||
      f.name.toLowerCase().endsWith(".xlsx") ||
      f.name.toLowerCase().endsWith(".csv")
  );

  if (!volFile) {
    console.error("\nNo volunteer file found in Google Drive folder!");
    process.exit(1);
  }

  console.log(`\nDownloading file: "${volFile.name}" (ID: ${volFile.id})...`);
  const token = await getDriveAccessToken();
  if (!token) {
    throw new Error("Could not get Google Drive access token.");
  }

  const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${volFile.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!downloadRes.ok) {
    console.error("Failed to download file from Google Drive:", downloadRes.statusText);
    process.exit(1);
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 3. Parse spreadsheet
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  console.log(`\nParsed ${rawRows.length} rows from sheet "${sheetName}".`);
  if (rawRows.length > 0) {
    console.log("Headers in file:", Object.keys(rawRows[0]));
  }

  // 4. Extract registered volunteers
  const registeredVolunteers: Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    division: string;
    team: string;
    rawRow: any;
  }> = [];

  for (const r of rawRows) {
    const keys = Object.keys(r);
    const getVal = (possibleNames: string[]) => {
      const matchKey = keys.find((k) =>
        possibleNames.some((p) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === p.toLowerCase().replace(/[^a-z0-9]/g, ""))
      );
      return matchKey ? String(r[matchKey] || "").trim() : "";
    };

    const firstName = getVal(["Volunteer First Name", "First Name", "FirstName"]);
    const lastName = getVal(["Volunteer Last Name", "Last Name", "LastName"]);
    const email = normalizeEmail(getVal(["Volunteer Email", "Email", "Email Address"]));
    const phone = normalizePhone(getVal(["Volunteer Cell Phone", "Cell Phone", "Phone", "CellPhone", "Volunteer Phone"]));
    const role = getVal(["Volunteer Role", "Role", "Position"]);
    const division = getVal(["Division Name", "Division"]);
    const team = getVal(["Team Name", "Team"]);

    if (firstName || lastName || email) {
      registeredVolunteers.push({
        firstName,
        lastName,
        email,
        phone,
        role,
        division,
        team,
        rawRow: r,
      });
    }
  }

  console.log(`Extracted ${registeredVolunteers.length} registered volunteer records from file.`);

  // 5. Match against Coaching Interest Submissions
  console.log("\n==================================================");
  console.log("MATCHING EVALUATION");
  console.log("==================================================");

  const updates: Array<{
    id: string;
    name: string;
    email: string;
    matchedBy: string;
    matchedRole: string;
    matchedDivision: string;
    matchedTeam: string;
  }> = [];

  for (const ci of interests) {
    const ciEmail = normalizeEmail(ci.email);
    const ciFirst = normalizeName(ci.firstName);
    const ciLast = normalizeName(ci.lastName);
    const ciPhone = normalizePhone(ci.cellPhone);

    // Search for match
    let match = registeredVolunteers.find((rv) => {
      if (ciEmail && rv.email && ciEmail === rv.email) return true;
      if (
        ciFirst &&
        ciLast &&
        normalizeName(rv.firstName) === ciFirst &&
        normalizeName(rv.lastName) === ciLast
      )
        return true;
      if (ciPhone && rv.phone && ciPhone.length >= 7 && (rv.phone.endsWith(ciPhone) || ciPhone.endsWith(rv.phone)))
        return true;
      return false;
    });

    if (match) {
      let matchReason = "";
      if (ciEmail && match.email && ciEmail === match.email) matchReason = `Email (${ci.email})`;
      else if (
        ciFirst &&
        ciLast &&
        normalizeName(match.firstName) === ciFirst &&
        normalizeName(match.lastName) === ciLast
      )
        matchReason = `Name (${match.firstName} ${match.lastName})`;
      else matchReason = `Phone (${match.phone})`;

      updates.push({
        id: ci.id,
        name: `${ci.firstName} ${ci.lastName}`,
        email: ci.email,
        matchedBy: matchReason,
        matchedRole: match.role || "Volunteer",
        matchedDivision: match.division || "N/A",
        matchedTeam: match.team || "Unassigned",
      });

      console.log(
        `✅ MATCHED: ${ci.firstName} ${ci.lastName} <${ci.email}>`
      );
      console.log(`   Via:              ${matchReason}`);
      console.log(`   Registered Role:  ${match.role || "Volunteer"}`);
      console.log(`   Division & Team:  ${match.division || "N/A"} - ${match.team || "Unassigned"}\n`);
    } else {
      console.log(
        `❌ UNMATCHED: ${ci.firstName} ${ci.lastName} <${ci.email}> (${ci.cellPhone}) - Interested Division: ${ci.interestedDivision}`
      );
    }
  }

  // 6. Apply database updates for matched submissions
  console.log(`--------------------------------------------------`);
  console.log(`Updating ${updates.length} matched submission(s) in database to status = CONVERTED (Registered)...`);
  const now = new Date();

  for (const u of updates) {
    await prisma.coachingInterestSubmission.update({
      where: { id: u.id },
      data: {
        status: CoachingInterestStatus.CONVERTED,
        convertedAt: now,
        adminNotes: `Registered volunteer confirmed in SportsConnect Google Drive sync file (${volFile.name}). Matched via ${u.matchedBy}. Role: ${u.matchedRole}, Division: ${u.matchedDivision}, Team: ${u.matchedTeam}. Updated on ${now.toISOString()}`,
      },
    });
  }

  console.log(`\nSuccessfully updated ${updates.length} Coaching Interest record(s) to CONVERTED (Registered)!`);
}

run()
  .catch((err) => {
    console.error("\nFATAL ERR:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
