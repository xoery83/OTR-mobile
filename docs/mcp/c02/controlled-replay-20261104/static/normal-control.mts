// Reconstructed after power loss; new source/hash, never claimed as original 626e96ac.
import assert from 'node:assert/strict';
import { z } from 'zod';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export const CLIENT = '83504d3f-59d4-43fd-99b1-bebc54c40f7d';
export const ACCOUNT = '1f3d7935-1bdc-4952-8d7f-0f72077368c1';
const AUTH = '/Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical';
const WINDOW = 'c2d7c9bc03cb413ca7d082ccf8338f0c';

type Response = { status: number; grants?: unknown };
export async function holdControl(io: {
  accountId: string; clientId: string; startedAt: number; now(): number;
  signal(): { finish: boolean; revoke: boolean }; wait(): Promise<void>;
  request(method: 'GET' | 'DELETE'): Promise<Response>;
  note(phase: string): void;
}) {
  assert.equal(io.accountId, ACCOUNT); assert.equal(io.clientId, CLIENT);
  const start = io.startedAt; let attempted = false, reconciled = false;
  const absent = async () => {
    const result = await io.request('GET'); assert.equal(result.status, 200);
    const grants = z.array(z.object({ client: z.object({ id: z.uuid() }) })).max(256).parse(result.grants);
    return !grants.some(g => g.client.id.toLowerCase() === CLIENT);
  };
  const revoke = async () => {
    if (reconciled) return;
    assert(!attempted, 'UNKNOWN_GRANT_REVOKE_NO_RETRY'); attempted = true;
    if (!(await absent())) {
      const result = await io.request('DELETE');
      assert(result.status === 204 || result.status === 404, 'GRANT_REVOKE_UNCONFIRMED');
      assert(await absent(), 'GRANT_STILL_VISIBLE');
    }
    reconciled = true; io.note('GRANT_ABSENT_VERIFIED');
  };
  try {
    assert(io.now() >= start && io.now() - start < 33 * 60000, 'CONTROL_SETUP_DEADLINE');
    io.note('CONTROL_READY');
    // Reserve two minutes of the35minute cap for grant and owning Session cleanup.
    while (io.now() - start < 33 * 60000) {
      const s = io.signal();
      if (s.revoke || s.finish) await revoke();
      if (s.finish) return;
      await io.wait();
    }
    throw new Error('CONTROL_DEADLINE');
  } finally {
    // A failed/unknown revoke is never sent again; owning Auth finally closes its Session.
    if (!attempted) await revoke();
  }
}

async function main() {
  const startedAt = performance.now();
  const directory = process.argv[2];
  assert.equal(directory, '/private/tmp/otr-auth-consumer-control-c02-' + WINDOW);
  assert.equal(process.argv[3], CLIENT);
  mkdirSync(directory, { mode: 0o700 });
  const st = lstatSync(directory);
  assert(st.isDirectory() && !st.isSymbolicLink() && st.uid === process.getuid?.() && (st.mode & 0o777) === 0o700);
  const { withRegisteredQaHostSession } = await import(pathToFileURL(AUTH + '/scripts/auth/registered-qa-host-session.ts').href);
  const { publicConfiguration } = await import(pathToFileURL(AUTH + '/scripts/auth/resend-inbound-otp-e2e.ts').href);
  const { createRequestBoundary, readBoundedJson } = await import(pathToFileURL(AUTH + '/src/data/api/requestBoundary.ts').href);
  const configuration = publicConfiguration(process.env);
  assert.equal(configuration.url, 'https://tuqigdxrvrerfewsxqgm.supabase.co');
  let sequence = 0;
  const note = (phase: string) => writeFileSync(directory + '/status-' + (++sequence) + '.json',
    JSON.stringify({ phase, clientId: CLIENT, accountId: ACCOUNT, at: new Date().toISOString(), secretsRecorded: false }) + '\n',
    { flag: 'wx', mode: 0o600 });
  const marked = (name: string) => {
    const path = directory + '/' + name;
    if (!existsSync(path)) return false;
    const s = lstatSync(path);
    assert(s.isFile() && !s.isSymbolicLink() && s.uid === process.getuid?.() && s.nlink === 1 && (s.mode & 0o777) === 0o600 && s.size <= 64);
    return true;
  };
  const result = await withRegisteredQaHostSession(async (context: { accountId: string; readSession(): Promise<{accessToken: string}> }) => {
    await holdControl({ accountId: context.accountId, clientId: CLIENT, startedAt, now: () => performance.now(),
      signal: () => ({ finish: marked('FINISH'), revoke: marked('REVOKE') }),
      wait: () => new Promise(r => setTimeout(r, 500)), note,
      async request(method) {
        const session = await context.readSession();
        const url = new URL('/auth/v1/user/oauth/grants', configuration.url);
        if (method === 'DELETE') url.searchParams.set('client_id', CLIENT);
        const boundary = createRequestBoundary(10000);
        try {
          const response = await boundary.run(() => fetch(url, { method, redirect: 'error', signal: boundary.signal,
            headers: { apikey: configuration.publishableKey, Authorization: 'Bearer ' + session.accessToken } }));
          if (method === 'GET' && response.ok) {
            const grants = await readBoundedJson(response, 262144, boundary);
            return { status: response.status, grants };
          }
          await response.body?.cancel(); return { status: response.status };
        } finally { boundary.close(); }
      }
    });
  });
  assert.equal(result.ownSessionCleanup, 'PASS_LOCAL_SCOPE_REFRESH_REVOKED');
  note('OWN_SESSION_CLEANUP_PASS');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('CONTROL_FAILED_OR_UNKNOWN_NO_RETRY\n'); process.exitCode = 1; });
}
