-- Prisma PPG adapter sends malformed array literals for text[]; store venues as JSONB.
ALTER TABLE "OrgAlert" ALTER COLUMN "venues" SET DATA TYPE JSONB USING to_jsonb("venues");
ALTER TABLE "OrgAlert" ALTER COLUMN "venues" SET DEFAULT '[]'::jsonb;
