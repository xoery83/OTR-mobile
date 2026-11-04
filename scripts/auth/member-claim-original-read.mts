// DEV-only original UNKNOWN reconciliation. No business mutation or operation replacement.
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureAccountRequestContext } from '../../src/data/auth/accountRequestContext';
import { fixtureTransport, readOriginalFixtureOutcome } from './member-claim-qa-item-fixtures';
import { createNormalRegisteredQaHostDependencies, runRegisteredQaHostSession } from './registered-qa-host-session';
import { createAcceptedHostQaReceiver } from './resend-inbound-otp-native-relogin';
import { inboundKeychainArgs, publicConfiguration } from './resend-inbound-otp-e2e';

const qa = Object.freeze({
  accountId: '26876e6e-a919-457d-bc00-78d76ba08043',
  tripId: 'fb2f0820-e429-404a-b4dd-7adcad814e45',
  email: 'otr-qa-3f43c81b-500b-4e59-b0a8-c7ffdbd19a31@eldouzileu.resend.app',
});
const originalOperationId = 'f5e13639-4240-4817-bf43-c60a1ea46361';
function assertBusinessRead(url: string, method: string | undefined) {
  const base = `https://api-dev.xoery.art/v2/trips/${qa.tripId}/core/`;
  if (method !== 'GET' || ![base + 'collection', base + 'operations/' + originalOperationId].includes(url))
    throw Error('ORIGINAL_RECOVERY_GET_ONLY');
}
if (process.argv[2] === '--self-check') {
  const base = `https://api-dev.xoery.art/v2/trips/${qa.tripId}/core/`;
  assert.doesNotThrow(() => assertBusinessRead(base + 'collection', 'GET'));
  assert.doesNotThrow(() => assertBusinessRead(base + 'operations/' + originalOperationId, 'GET'));
  for (const [url, method] of [[base + 'commands', 'POST'], [base + 'collection', 'POST'], [base + 'operations/other', 'GET'], ['https://api-dev.xoery.art/v2/trips/other/core/collection', 'GET']])
    assert.throws(() => assertBusinessRead(url, method));
  console.log('READ_ONLY_ROUTE_SELF_CHECK_PASS; no Auth or network IO');
  process.exit(0);
}
const root = resolve('docs/ops/auth-c04-item-fixture-20261104/original-recovery');
if (process.argv[2] !== '--execute-read-only') throw Error('EXPLICIT_READ_ONLY_RUN_REQUIRED');
const installed = JSON.parse(readFileSync(resolve(root, 'INSTALL_RETURN_VERIFIED.json'), 'utf8'));
if (installed.status !== 'EXACT_INSTALL_RECEIPT_VERIFIED_NO_REINSTALL') throw Error('INSTALL_RECEIPT_REQUIRED');
const first = JSON.parse(readFileSync('docs/ops/auth-inbound-otp-20261030/FIRST_USER_E2E.json', 'utf8'));
if (first.status !== 'PASS' || first.reuseReleased !== true) throw Error('FIRST_USER_PROOF_REQUIRED');
for (const [file, sha] of Object.entries(first.toolHashes)) {
  if (createHash('sha256').update(readFileSync(`scripts/auth/${file}`)).digest('hex') !== sha)
    throw Error('FIRST_USER_PROOF_CODE_CHANGED');
}
if (process.env.OTR_QA_RESEND_SCOPE !== 'dedicated-qa-team') throw Error('DEDICATED_QA_SCOPE_REQUIRED');
const options = publicConfiguration(process.env);
const lock = resolve(root, 'read-only-attempt.lock');
mkdirSync(lock); // Durable across reboot; never delete an uncertain attempt automatically.
let attempted = false, clean = false;
const record: Record<string, unknown> = {
  scope: 'NORMAL_OWNER_ORIGINAL_RECEIPT_GET_ONLY', accountId: qa.accountId,
  tripId: qa.tripId, operationId: 'f5e13639-4240-4817-bf43-c60a1ea46361',
  startedAt: new Date().toISOString(), secretsOrOtpRecorded: false, businessPosts: 0,
};
const persist = () => writeFileSync(resolve(root, 'ACTUAL_READ_ONLY_OUTCOME.json'), JSON.stringify(record, null, 2) + '\n');
const note = (value: Record<string, unknown>) => {
  if (value.phase === 'OTP_REQUEST_ATTEMPTED') attempted = true;
  if (value.ownSessionCleanup === 'PASS_LOCAL_SCOPE_REFRESH_REVOKED') clean = true;
  Object.assign(record, value); persist();
};
try {
  const key = execFileSync('/usr/bin/security', [...inboundKeychainArgs], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000,
  }).trim();
  const receiver = createAcceptedHostQaReceiver({
    key, scope: 'dedicated-qa-team', email: qa.email,
    reserve(value) {
      const last = resolve(root, 'LAST_CHALLENGE.json');
      if (existsSync(last) && Date.now() - Date.parse(JSON.parse(readFileSync(last, 'utf8')).requestedAt) < 60000)
        throw Error('NORMAL_OWNER_OTP_COOLDOWN');
      writeFileSync(last, JSON.stringify(value) + '\n');
    },
  });
  const nativeFetch = globalThis.fetch;
  // Hard wire boundary: Auth uses its existing routes; business IO is GET-only.
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api-dev.xoery.art/')) {
      assertBusinessRead(String(url), init?.method);
    }
    return nativeFetch(url, init);
  };
  try {
    const sessionResult = await runRegisteredQaHostSession(
      createNormalRegisteredQaHostDependencies(receiver, note, options),
      async (session) => {
        const context = await captureAccountRequestContext(qa.tripId, async () => session.accountId);
        record.originalRead = await readOriginalFixtureOutcome(fixtureTransport(session, note), context);
        persist();
      }, qa,
    );
    record.sessionResult = sessionResult;
    record.status = 'READ_COMPLETED_NO_REPLAY';
  } finally { globalThis.fetch = nativeFetch; }
} catch (error) {
  record.status = 'STOPPED_NO_RETRY';
  record.error = { name: error instanceof Error ? error.name : 'UnknownError', code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'READ_OR_AUTH_FAILED' };
  process.exitCode = 1;
} finally {
  record.completedAt = new Date().toISOString(); persist();
  if (!attempted || clean) rmSync(lock, { recursive: true });
}
