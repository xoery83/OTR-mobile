// New normal synthetic users for the explicit isolated issuer audience; old users remain intact.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
export async function prepareBetaOAuthAccounts() {
  const root = "/private/tmp/otr-mcp-beta-layer3-runtime";
  const ports = JSON.parse(readFileSync(root + "/ports.json", "utf8"));
  assert.equal(ports.backendPort, 46990);
  const output = root + "/oauth-accounts.json";
  const accounts: {
    role: string;
    email: string;
    password: string;
    accountId: string;
    token: string;
  }[] = existsSync(output) ? JSON.parse(readFileSync(output, "utf8")) : [];
  assert.ok(
    accounts.length <= 3 && new Set(accounts.map((a) => a.role)).size === accounts.length,
  );
  for (const account of accounts) {
    assert.ok(["owner", "member", "outside"].includes(account.role));
    assert.match(account.email, /^layer3-oauth-[a-z]+-[0-9a-f-]+@example\.invalid$/);
    assert.match(account.accountId, /^[0-9a-f-]{36}$/);
    assert.ok(account.password.length >= 32);
  }
  for (const role of ["owner", "member", "outside"]) {
    if (accounts.some((a) => a.role === role)) continue;
    const email = `layer3-oauth-${role}-${randomUUID()}@example.invalid`,
      password = randomBytes(32).toString("base64url");
    const response = await fetch(`http://127.0.0.1:${ports.authPort}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });
    const value = await response.json();
    assert.equal(response.status, 200);
    assert.equal(value.user.is_anonymous, false);
    const claims = JSON.parse(
      Buffer.from(value.access_token.split(".")[1], "base64url").toString(),
    );
    assert.deepEqual(Array.isArray(claims.aud) ? claims.aud : [claims.aud], [
      "authenticated",
    ]);
    assert.equal(claims.client_id, undefined);
    assert.equal(claims.otr_scopes, undefined);
    accounts.push({
      role,
      email,
      password,
      accountId: value.user.id,
      token: value.access_token,
    });
    writeFileSync(output, JSON.stringify(accounts, null, 2) + "\n", { mode: 0o600 });
  }
  return accounts;
}
if (process.env.OTR_MCP_BETA_NEW_OAUTH_ACCOUNTS === "1") {
  const accounts = await prepareBetaOAuthAccounts();
  console.log(
    JSON.stringify({
      status: "NORMAL_OAUTH_FIXTURE_ACCOUNTS_READY",
      count: accounts.length,
      oldAccountsPreserved: true,
      manualTokens: 0,
    }),
  );
}
