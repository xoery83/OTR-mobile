import { mkdtempSync, chmodSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { createOtpTestVault } from "../../scripts/auth/otp-test-vault";
import {
  publicConfiguration,
  devOrigin,
} from "../../scripts/auth/resend-inbound-otp-e2e";
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const directory = mkdtempSync("/private/tmp/otr-vault-unit-");
  chmodSync(directory, 0o700);
  directories.push(directory);
  return { directory, key: randomBytes(32) };
}
it("restores exact storage through a new adapter without plaintext token bytes on disk", async () => {
  const f = fixture(),
    first = createOtpTestVault(f.directory, f.key);
  await first.setItem("session", "test-secret-token-must-not-be-on-disk");
  const second = createOtpTestVault(f.directory, f.key);
  expect(await second.getItem("session")).toBe("test-secret-token-must-not-be-on-disk");
  expect(readFileSync(join(f.directory, "session-vault.enc"), "utf8")).not.toContain(
    "test-secret-token",
  );
  await second.deleteItem("session");
  expect(await first.getItem("session")).toBeNull();
});
it("rejects a wrong key or corrupted authenticated ciphertext", async () => {
  const f = fixture(),
    vault = createOtpTestVault(f.directory, f.key);
  await vault.setItem("a", "b");
  await expect(
    createOtpTestVault(f.directory, randomBytes(32)).getItem("a"),
  ).rejects.toThrow("INTEGRITY_FAILURE");
  const file = join(f.directory, "session-vault.enc"),
    value = JSON.parse(readFileSync(file, "utf8"));
  value.body = Buffer.from("tampered").toString("base64");
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  await expect(vault.getItem("a")).rejects.toThrow("INTEGRITY_FAILURE");
});
it("refuses loose file/directory permissions", async () => {
  const f = fixture();
  chmodSync(f.directory, 0o755);
  expect(() => createOtpTestVault(f.directory, f.key)).toThrow("SCOPE_INVALID");
  chmodSync(f.directory, 0o700);
  const vault = createOtpTestVault(f.directory, f.key);
  await vault.setItem("a", "b");
  chmodSync(join(f.directory, "session-vault.enc"), 0o644);
  await expect(vault.getItem("a")).rejects.toThrow("SCOPE_INVALID");
});
it("does not expose inherited prototype values as storage entries", async () => {
  const f = fixture(),
    vault = createOtpTestVault(f.directory, f.key);
  expect(await vault.getItem("toString")).toBeNull();
  await vault.setItem("__proto__", "private-value");
  expect(await vault.getItem("__proto__")).toBe("private-value");
});
it("permits only explicit DEV configuration with a public client key", () => {
  const env = {
    NODE_ENV: "test" as const,
    OTR_DEV_OTP_TEST: "1",
    EXPO_PUBLIC_OTR_DEV_SUPABASE_URL: devOrigin,
    EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "x".repeat(32),
  };
  expect(publicConfiguration(env).url).toBe(devOrigin);
  expect(() => publicConfiguration({ ...env, OTR_DEV_OTP_TEST: "0" })).toThrow(
    "DEV_ONLY",
  );
  expect(() =>
    publicConfiguration({
      ...env,
      EXPO_PUBLIC_OTR_DEV_SUPABASE_URL: "https://production.example",
    }),
  ).toThrow("DEV_ONLY");
  expect(() =>
    publicConfiguration({
      ...env,
      EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "sb_secret_" + "x".repeat(32),
    }),
  ).toThrow("PUBLIC_ANON");
});
it("reconstructs the existing repository in a separate process using ciphertext and a private input pipe", async () => {
  const { createAuthRepository } =
    await import("../../src/data/auth/authSessionRepository");
  const { spawnSync } = await import("node:child_process");
  const f = fixture(),
    id = "00000000-0000-4000-8000-000000000001";
  const repo = createAuthRepository(createOtpTestVault(f.directory, f.key));
  // Repository mechanics fixture only; this token is never sent to any Auth server.
  await repo.writeLocalSession({
    accessToken: "unit-only-not-a-real-token",
    refreshToken: "unit-only-refresh",
    expiresAt: "2099-01-01T00:00:00.000Z",
    identity: { userId: id, email: "unit@example.invalid", displayName: "Unit" },
  });
  const code = `const fs=require('node:fs');const {createOtpTestVault}=require('./scripts/auth/otp-test-vault.ts');const {createAuthRepository}=require('./src/data/auth/authSessionRepository.ts');const input=JSON.parse(fs.readFileSync(0,'utf8'));createAuthRepository(createOtpTestVault(input.directory,Buffer.from(input.key,'base64'))).readAdoptedLocalSession().then(s=>process.stdout.write(JSON.stringify({id:s.identity.userId}))).catch(()=>{process.exitCode=1;});`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "-e", code], {
    input: JSON.stringify({ directory: f.directory, key: f.key.toString("base64") }),
    encoding: "utf8",
    timeout: 10000,
  });
  expect(child.status).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual({ id });
  expect(child.stdout).not.toContain("unit-only");
});
it("reserves revoke before wire and never retries UNKNOWN during failure cleanup", async () => {
  const { createQaSessionRevoker } = await import("../../scripts/auth/otp-test-cleanup");
  let attempts = 0;
  const revoker = createQaSessionRevoker(async () => {
    attempts++;
    throw Error("UNKNOWN");
  });
  revoker.bindProvenToken("unit-proven-session");
  await expect(revoker.revokeOnce()).rejects.toThrow("UNKNOWN");
  expect(await revoker.cleanupIfUnattempted()).toBe(false);
  await expect(revoker.revokeOnce()).rejects.toThrow("ALREADY_ATTEMPTED");
  expect(attempts).toBe(1);
});
it("does not revoke a returned token whose new-account ownership was never proven", async () => {
  const { createQaSessionRevoker } = await import("../../scripts/auth/otp-test-cleanup");
  let attempts = 0;
  const revoker = createQaSessionRevoker(async () => {
    attempts++;
  });
  expect(await revoker.cleanupIfUnattempted()).toBe(false);
  await expect(revoker.revokeOnce()).rejects.toThrow("NO_PROVEN_SESSION");
  expect(attempts).toBe(0);
});
