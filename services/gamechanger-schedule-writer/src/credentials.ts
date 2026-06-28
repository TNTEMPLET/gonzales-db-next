import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GameChangerCredentials = {
  username: string;
  password: string;
};

function parseBwLoginFields(stdout: string): GameChangerCredentials {
  const fields = JSON.parse(stdout) as {
    login?: { username?: string; password?: string };
  };
  const username = fields.login?.username?.trim();
  const password = fields.login?.password;
  if (!username || !password) {
    throw new Error("Gringotts item is missing login.username or login.password.");
  }
  return { username, password };
}

function pickGameChangerItem(items: Array<{
  name?: string;
  login?: { username?: string; password?: string; uris?: Array<{ uri?: string }> };
}>): {
  name?: string;
  login?: { username?: string; password?: string; uris?: Array<{ uri?: string }> };
} {
  const withGcUri = items.find((item) =>
    item.login?.uris?.some((entry) => entry.uri?.includes("web.gc.com")),
  );
  if (withGcUri?.login?.username && withGcUri.login.password) return withGcUri;

  const withPassword = items.find((item) => item.login?.username?.trim() && item.login?.password);
  if (withPassword) return withPassword;

  throw new Error(
    "Multiple Gringotts items match the vault label but none have GameChanger web.gc.com credentials.",
  );
}

export async function loadGameChangerCredentials(): Promise<GameChangerCredentials> {
  const fromEnvUsername = process.env.GC_WRITER_GC_USERNAME?.trim();
  const fromEnvPassword = process.env.GC_WRITER_GC_PASSWORD;
  if (fromEnvUsername && fromEnvPassword) {
    return { username: fromEnvUsername, password: fromEnvPassword };
  }

  const itemName = process.env.GRINGOTTS_GC_VAULT_ITEM?.trim() || "2b27eaf4-924f-469c-b469-cda4ab99bc40";
  const bwBin = process.env.BW_BIN?.trim() || "bw";
  const session = process.env.BW_SESSION?.trim();
  const sessionArgs = session ? ["--session", session] : [];

  const { stdout } = await execFileAsync(bwBin, [...sessionArgs, "get", "item", itemName], {
    env: process.env,
    maxBuffer: 1024 * 1024,
  });

  const trimmed = stdout.trim();
  if (trimmed.startsWith("[")) {
    const items = JSON.parse(trimmed) as Array<{
      name?: string;
      login?: { username?: string; password?: string; uris?: Array<{ uri?: string }> };
    }>;
    return parseBwLoginFields(JSON.stringify(pickGameChangerItem(items)));
  }

  return parseBwLoginFields(stdout);
}
