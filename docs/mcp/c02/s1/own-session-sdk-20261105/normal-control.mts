import { createOwnSessionConsent, ownConsentQA, readSdkRelease, sdkPackageHash } from '../../../../../scripts/mcp/c02-own-session-consent.mts';
import { prepareOwnCallbackPipe, sendOwnCallback } from '../../../../../scripts/mcp/c02-own-callback-pipe.mts';
// Reconstructed after power loss; new source/hash, never claimed as original 626e96ac.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { constants, openSync, closeSync, fstatSync, readFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export const CLIENT = '83504d3f-59d4-43fd-99b1-bebc54c40f7d';
export const ACCOUNT = '1f3d7935-1bdc-4952-8d7f-0f72077368c1';
const AUTH = '/Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical';
const WINDOW = '6d49f895887d437c9294d381bcd8005d';
const GATE_SHA256 = '0a4fdc188d708fd42be384081f8b8ca9c02e0a601673696829799804aaa4ef0f';
const SCOPE_SHA256 = '7f86d8d643f298a90f0130bc578a13ec1ffacfd4111cc84298221fa8b0cb71b4';

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
  const bindingPath = process.argv[4];
  assert(bindingPath && resolve(bindingPath).startsWith('/Users/xoery/Project/otr-mobile-import/root2-hosted-ops-acceptance-20261103/.root2-private/') && bindingPath.endsWith('/ROOT2_NORMAL_CONTROL_START_BINDING.json') && process.argv[5] === GATE_SHA256, 'SDK_START_BINDING_REQUIRED');
  const readStart = () => {
    const fd = openSync(bindingPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const st = fstatSync(fd); assert(st.isFile() && st.uid === process.getuid?.() && st.nlink === 1 && (st.mode & 0o777) === 0o600 && st.size > 0 && st.size <= 65536, 'SDK_START_BINDING_UNSAFE'); return readFileSync(fd, 'utf8'); }
    finally { closeSync(fd); }
  };
  const bindingRaw = readStart();
  execFileSync('python3', [new URL('./c02-normal-control.py', import.meta.url).pathname, '--validate-entry-only', bindingPath, GATE_SHA256], { stdio: 'ignore', timeout: 10000 });
  assert(createHash('sha256').update(readStart()).digest('hex') === createHash('sha256').update(bindingRaw).digest('hex'), 'SDK_START_BINDING_CHANGED');
  const sourcePackageSHA256 = sdkPackageHash(process.getuid!());
  assert(JSON.parse(bindingRaw).sdkSourcePackageSHA256 === sourcePackageSHA256, 'SDK_START_PACKAGE_MISMATCH');
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
  const readPrivateJSON = (name: string) => {
    const path = directory + '/' + name;
    if (!existsSync(path)) return undefined;
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = fstatSync(fd);
      assert(st.isFile() && st.uid === process.getuid?.() && st.nlink === 1 && (st.mode & 0o777) === 0o600 && st.size > 0 && st.size <= 4096);
      return JSON.parse(readFileSync(fd, 'utf8'));
    } finally { closeSync(fd); }
  };
  const result = await withRegisteredQaHostSession(async (context: { accountId: string; readSession(): Promise<{accessToken: string; refreshToken: string; expiresAt: string; identity: {userId: string}}> }) => {
    let consent: Awaited<ReturnType<typeof createOwnSessionConsent>> | undefined;
    let summary: Awaited<ReturnType<NonNullable<typeof consent>['preview']>> | undefined;
    let callbackPipe: string | undefined;
    let requestConsumed = false, approvalConsumed = false;
    const pollConsent = async () => {
      if (marked('FINISH') || marked('REVOKE')) return;
      if (!requestConsumed) {
        const raw = readPrivateJSON('OWN_CONSENT_REQUEST.json');
        if (raw === undefined) return;
        requestConsumed = true;
        const request = z.strictObject({ authorizationId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/), windowId: z.literal(WINDOW), gateSHA256: z.literal(GATE_SHA256), scopeSHA256: z.literal(SCOPE_SHA256), clientId: z.literal(CLIENT), accountId: z.literal(ACCOUNT), resource: z.literal(ownConsentQA.resource) }).parse(raw);
        const { notAfter: normal } = readSdkRelease(directory, process.getuid!(), { windowId: WINDOW, gateSHA256: GATE_SHA256, scopeSHA256: SCOPE_SHA256, sourcePackageSHA256 });
        consent = await createOwnSessionConsent(context, request.authorizationId, configuration.publishableKey, true, fetch, normal, () => marked('FINISH') || marked('REVOKE'));
        summary = await consent.preview();
        callbackPipe = prepareOwnCallbackPipe(directory, process.getuid!());
        writeFileSync(directory + '/OWN_CONSENT_PREVIEW.json', JSON.stringify({ ...summary, callbackPipe, notAfter: normal, ownerUid: process.getuid!(), secretsRecorded: false }) + '\n', { flag: 'wx', mode: 0o600 });
        note('SDK_CONSENT_SAFE_PREVIEW_READY');
      }
      if (!approvalConsumed) {
        const raw = readPrivateJSON('OWN_CONSENT_APPROVE.json');
        if (raw === undefined) return;
        approvalConsumed = true;
        const approval = z.strictObject({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).parse(raw);
        assert(consent && summary && callbackPipe && approval.digest === summary.digest);
        await consent.approve(approval.digest, (url, notAfter) => sendOwnCallback(callbackPipe!, process.getuid!(), url, notAfter));
        note('SDK_CONSENT_CALLBACK_HANDED_OFF_ONCE');
      }
    };
    await holdControl({ accountId: context.accountId, clientId: CLIENT, startedAt, now: () => performance.now(),
      signal: () => ({ finish: marked('FINISH'), revoke: marked('REVOKE') }),
      wait: async () => { await pollConsent(); await new Promise(r => setTimeout(r, 500)); }, note,
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
