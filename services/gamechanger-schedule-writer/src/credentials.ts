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

export async function loadGameChangerCredentials(): Promise<GameChangerCredentials> {
  const itemName = process.env.GRINGOTTS_GC_VAULT_ITEM?.trim() || "SRF - Trent";
  const bwBin = process.env.BW_BIN?.trim() || "bw";
  const session = process.env.BW_SESSION?.trim();
  const args = session ? ["--session", session, "get", "item", itemName, "--fields", "login"] : ["get", "item", itemName, "--fields", "login"];

  const { stdout } = await execFileAsync(bwBin, args, {
    env: process.env,
    maxBuffer: 1024 * 1024,
  });
  return parseBwLoginFields(stdout);
}
