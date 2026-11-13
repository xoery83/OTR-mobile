import assert from 'node:assert/strict';
import { holdControl, CLIENT, ACCOUNT } from './normal-control.mts';
let cases = 0;
for (const present of [false, true, 'uppercase']) {
  const calls: string[] = [], notes: string[] = []; let hasGrant = present;
  await holdControl({ accountId: ACCOUNT, clientId: CLIENT, startedAt: 0, now: () => 0,
    signal: () => ({ finish: true, revoke: false }), wait: async () => { throw new Error('NO_WAIT'); },
    note: p => notes.push(p), request: async method => {
      calls.push(method);
      if (method === 'DELETE') { hasGrant = false; return { status: 204 }; }
      return { status: 200, grants: hasGrant ? [{ client: { id: present === 'uppercase' ? CLIENT.toUpperCase() : CLIENT } }] : [] };
    } });
  assert.deepEqual(calls, present ? ['GET', 'DELETE', 'GET'] : ['GET']);
  assert.deepEqual(notes, ['CONTROL_READY', 'GRANT_ABSENT_VERIFIED']); cases++;
}
for (const failure of ['delete-unknown', 'still-visible', 'get-rejected', 'malformed', 'malformed-id']) {
  const calls: string[] = [], notes: string[] = [];
  await assert.rejects(holdControl({ accountId: ACCOUNT, clientId: CLIENT, startedAt: 0, now: () => 0,
    signal: () => ({ finish: true, revoke: true }), wait: async () => {}, note: p => notes.push(p),
    request: async method => {
      calls.push(method);
      if (method === 'DELETE') { if (failure === 'delete-unknown') throw new Error('UNKNOWN'); return { status: 204 }; }
      if (failure === 'get-rejected') return { status: 401 };
      if (failure === 'malformed') return { status: 200, grants: [{}] };
      if (failure === 'malformed-id') return { status: 200, grants: [{ client: { id: 'not-a-uuid' } }] };
      return { status: 200, grants: [{ client: { id: CLIENT } }] };
    } }));
  assert(calls.filter(c => c === 'DELETE').length <= 1); assert(!notes.includes('GRANT_ABSENT_VERIFIED')); cases++;
}
for (const field of ['accountId', 'clientId']) {
  let io = 0;
  await assert.rejects(holdControl({ accountId: ACCOUNT, clientId: CLIENT, startedAt: 0, [field]: 'wrong', now: () => 0,
    signal: () => ({ finish: true, revoke: false }), wait: async () => {}, note: () => { io++; },
    request: async () => { io++; return { status: 200, grants: [] }; } }));
  assert.equal(io, 0); cases++;
}
let now = 0, deletes = 0, present = true;
await assert.rejects(holdControl({ accountId: ACCOUNT, clientId: CLIENT, startedAt: 0, now: () => now,
  signal: () => ({ finish: false, revoke: false }), wait: async () => { now = 35 * 60000; }, note: () => {},
  request: async method => { if (method === 'DELETE') { deletes++; present = false; return { status: 204 }; }
    return { status: 200, grants: present ? [{ client: { id: CLIENT } }] : [] }; }
}), /CONTROL_DEADLINE/);
assert.equal(deletes, 1); cases++;
const setupNotes: string[] = []; let setupCleanupReads = 0;
await assert.rejects(holdControl({ accountId: ACCOUNT, clientId: CLIENT, startedAt: 0, now: () => 33 * 60000,
  signal: () => { throw new Error('MUST_NOT_WAIT_AFTER_EXPIRED_SETUP'); }, wait: async () => {}, note: p => setupNotes.push(p),
  request: async method => { assert.equal(method, 'GET'); setupCleanupReads++; return { status: 200, grants: [] }; }
}), /CONTROL_SETUP_DEADLINE/);
assert(!setupNotes.includes('CONTROL_READY')); assert.equal(setupCleanupReads, 1); cases++;
console.log(`${cases} reconstructed control lifecycle tests PASS; actual Auth/session/network/credentials IO=0`);
