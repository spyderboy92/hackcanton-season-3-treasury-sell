const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.TEST_LEDGER_BUILD;
const { hashPassword, verifyPassword, parseHash, burnVerification } = require(path.join(root, 'auth/server/password.js'));
const { signSession, verifySession, SESSION_TTL_SECONDS } = require(path.join(root, 'auth/server/session.js'));
const { allowedParties, assertMayActAs } = require(path.join(root, 'auth/server/policy.js'));
const { validateSignup, normalizeUsername } = require(path.join(root, 'auth/validate.js'));
const { canOpen, homeFor, landingFor } = require(path.join(root, 'auth/access.js'));

// Seeded by Demo.Bootstrap (Tests.Fixtures.demoAccounts) for password "treasury".
const TREASURY_HASH = 'scrypt$16384$8$1$-jvhI-OA0WlzFc33B6K6bw$rUI497KohQp-7cpG6ndxLU8_dgLaPjTfp-Eh2gCamlk';
const SECRET = 'test-secret-that-is-at-least-32-characters-long';

/* ── password hashes ─────────────────────────────────────────────────── */

test('the seeded treasury hash verifies with the right password only', async () => {
  assert.equal(await verifyPassword('treasury', TREASURY_HASH), true);
  assert.equal(await verifyPassword('Treasury', TREASURY_HASH), false);
  assert.equal(await verifyPassword('treasury ', TREASURY_HASH), false);
  assert.equal(await verifyPassword('', TREASURY_HASH), false);
});

test('malformed or out-of-bounds hashes fail closed without throwing', async () => {
  const [, , , , salt, key] = TREASURY_HASH.split('$');
  for (const bad of [
    '',
    'treasury',
    TREASURY_HASH.replace('scrypt$', 'bcrypt$'),
    TREASURY_HASH.slice(0, -4), // truncated key
    `scrypt$16384$8$1$${salt}`, // missing key
    `scrypt$1000$8$1$${salt}$${key}`, // N not a power of two
    `scrypt$1073741824$8$1$${salt}$${key}`, // N far beyond anything we issue
    `scrypt$16384$8$1$${salt}$${key}$extra`,
    `scrypt$16384$8$1$sa+lt/==$${key}`, // not base64url
  ]) {
    assert.equal(parseHash(bad) === null || bad === TREASURY_HASH, true, `should not parse: ${bad}`);
    assert.equal(await verifyPassword('treasury', bad), false, `should not verify: ${bad}`);
  }
});

test('new hashes round-trip, use the documented parameters and a random salt', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.match(a, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('correct horsf', a), false);
  assert.equal(await burnVerification('anything'), false);
});

/* ── sessions ────────────────────────────────────────────────────────── */

const DEALER_B = { username: 'dealer-b', userType: 'Dealer', seat: 'dealerB' };

test('a signed session verifies and carries no party id', async () => {
  const { token, session } = await signSession(DEALER_B, { secret: SECRET });
  const verified = await verifySession(token, { secret: SECRET });
  assert.deepEqual(verified, session);
  assert.equal(verified.exp - Math.floor(Date.now() / 1000) <= SESSION_TTL_SECONDS, true);
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'seat', 'userType', 'username']);
});

test('tampered, re-signed, truncated and foreign-secret tokens are rejected', async () => {
  const { token } = await signSession(DEALER_B, { secret: SECRET });
  const [body, mac] = token.split('.');
  const forged = Buffer.from(
    JSON.stringify({ username: 'dealer-b', userType: 'Treasury', seat: 'treasury', exp: 9999999999 }),
  ).toString('base64url');
  assert.equal(await verifySession(`${forged}.${mac}`, { secret: SECRET }), null);
  const flipped = mac.slice(0, -1) + (mac.endsWith('A') ? 'B' : 'A');
  assert.equal(await verifySession(`${body}.${flipped}`, { secret: SECRET }), null);
  // The last character of the MAC holds two spare bits: a spelling that decodes
  // to the same bytes must still be refused, so a token has one valid form.
  const last = mac.at(-1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const sibling = alphabet[alphabet.indexOf(last) ^ 1];
  assert.equal(await verifySession(`${body}.${mac.slice(0, -1)}${sibling}`, { secret: SECRET }), null);
  const firstFlipped = (mac[0] === 'A' ? 'B' : 'A') + mac.slice(1);
  assert.equal(await verifySession(`${body}.${firstFlipped}`, { secret: SECRET }), null);
  assert.equal(await verifySession(body, { secret: SECRET }), null);
  assert.equal(await verifySession(`${body}.`, { secret: SECRET }), null);
  assert.equal(await verifySession(`${token}.x`, { secret: SECRET }), null);
  assert.equal(await verifySession(token, { secret: `${SECRET}-other` }), null);
  assert.equal(await verifySession('', { secret: SECRET }), null);
  assert.equal(await verifySession(undefined, { secret: SECRET }), null);
});

test('expired sessions are rejected', async () => {
  const now = Date.now();
  const { token } = await signSession(DEALER_B, { secret: SECRET, now, ttlSeconds: 60 });
  assert.notEqual(await verifySession(token, { secret: SECRET, now: now + 59_000 }), null);
  assert.equal(await verifySession(token, { secret: SECRET, now: now + 60_000 }), null);
  const { token: stale } = await signSession(DEALER_B, { secret: SECRET, now: now - 9 * 3600_000 });
  assert.equal(await verifySession(stale, { secret: SECRET, now }), null);
});

test('a validly signed session pairing a type with the wrong seat is rejected', async () => {
  const { token } = await signSession({ username: 'x', userType: 'Dealer', seat: 'treasury' }, { secret: SECRET });
  assert.equal(await verifySession(token, { secret: SECRET }), null);
});

/* ── signup validation ───────────────────────────────────────────────── */

const GOOD = { username: 'new.dealer', password: 'longenough', confirmPassword: 'longenough', userType: 'Dealer', dealerDesk: 'B' };

test('a valid signup is normalised onto a seat', () => {
  assert.deepEqual(validateSignup({ ...GOOD, username: '  New.Dealer ' }), {
    ok: true,
    value: { username: 'new.dealer', password: 'longenough', userType: 'Dealer', seat: 'dealerB' },
  });
  const treasury = validateSignup({ ...GOOD, userType: 'Treasury', dealerDesk: undefined });
  assert.equal(treasury.ok && treasury.value.seat, 'treasury');
  const auditor = validateSignup({ ...GOOD, userType: 'Auditor', dealerDesk: 'C' });
  assert.equal(auditor.ok && auditor.value.seat, 'auditor');
  assert.equal(normalizeUsername('  DEALER-B '), 'dealer-b');
});

test('signup rejects each invalid field with its own message', () => {
  const fieldsOf = (body) => {
    const r = validateSignup(body);
    assert.equal(r.ok, false);
    return Object.keys(r.fields).sort();
  };
  for (const username of ['ab', 'a'.repeat(33), '-leading', '.dot', 'has space', 'semi;colon', 'ünï', '']) {
    assert.deepEqual(fieldsOf({ ...GOOD, username }), ['username'], username);
  }
  for (const ok of ['abc', 'a'.repeat(32), '9lives', 'a.b_c-d']) {
    assert.equal(validateSignup({ ...GOOD, username: ok }).ok, true, ok);
  }
  assert.deepEqual(fieldsOf({ ...GOOD, password: 'short', confirmPassword: 'short' }), ['password']);
  assert.deepEqual(fieldsOf({ ...GOOD, password: 'x'.repeat(129), confirmPassword: 'x'.repeat(129) }), ['password']);
  assert.deepEqual(fieldsOf({ ...GOOD, confirmPassword: 'different!' }), ['confirmPassword']);
  assert.deepEqual(fieldsOf({ ...GOOD, userType: undefined }), ['userType']);
  assert.deepEqual(fieldsOf({ ...GOOD, userType: 'Registry' }), ['userType']);
  assert.deepEqual(fieldsOf({ ...GOOD, dealerDesk: undefined }), ['dealerDesk']);
  assert.deepEqual(fieldsOf({ ...GOOD, dealerDesk: 'D' }), ['dealerDesk']);
  assert.deepEqual(fieldsOf(null), ['confirmPassword', 'password', 'userType', 'username']);
});

/* ── who may act as whom ─────────────────────────────────────────────── */

const IDS = {
  treasury: 'Treasury::1', dealerA: 'DealerA::1', dealerB: 'DealerB::1',
  dealerC: 'DealerC::1', auditor: 'Auditor::1', registry: 'Registry::1',
};

test('each seat acts only as its own party; treasury also as the dealers (split demo)', () => {
  assert.deepEqual(allowedParties(DEALER_B, IDS), ['DealerB::1']);
  assert.deepEqual(allowedParties({ username: 'auditor', userType: 'Auditor', seat: 'auditor' }, IDS), ['Auditor::1']);
  assert.deepEqual(
    allowedParties({ username: 'treasury', userType: 'Treasury', seat: 'treasury' }, IDS).sort(),
    ['DealerA::1', 'DealerB::1', 'DealerC::1', 'Treasury::1'],
  );
  for (const user of [DEALER_B, { username: 't', userType: 'Treasury', seat: 'treasury' }]) {
    assert.equal(allowedParties(user, IDS).includes('Registry::1'), false);
    assert.equal(allowedParties(user, IDS).includes('Auditor::1'), false);
  }
});

test('assertMayActAs is a 403 outside the allowed set', () => {
  assert.doesNotThrow(() => assertMayActAs(DEALER_B, IDS, 'DealerB::1'));
  for (const party of ['Treasury::1', 'DealerA::1', 'Auditor::1', 'Registry::1', 'Unknown::1']) {
    assert.throws(() => assertMayActAs(DEALER_B, IDS, party), (e) => e.status === 403);
  }
});

test('page routing follows the seat, and ?next= cannot leave the origin', () => {
  const treasury = { username: 'treasury', userType: 'Treasury', seat: 'treasury' };
  assert.equal(homeFor(DEALER_B), '/dealer/b');
  assert.equal(canOpen(DEALER_B, '/dealer/b'), true);
  assert.equal(canOpen(DEALER_B, '/dealer/a'), false);
  assert.equal(canOpen(DEALER_B, '/treasury'), false);
  assert.equal(canOpen(DEALER_B, '/demo'), false);
  assert.equal(canOpen(treasury, '/demo'), true);
  assert.equal(canOpen(treasury, '/dealer/a'), false);
  assert.equal(landingFor(DEALER_B, '//evil.example/x'), '/dealer/b');
  assert.equal(landingFor(DEALER_B, '/treasury'), '/dealer/b');
  assert.equal(landingFor(treasury, '/demo'), '/demo');
});
