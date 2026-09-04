// Firestore security-rules tests (run against the Firestore emulator).
//
//   npm run test:rules
//
// This launches the emulator via `firebase emulators:exec` and runs the suite
// with Node's built-in test runner. Requires Java (for the emulator) and the
// devDependencies installed (`npm install`).

const { readFileSync } = require('node:fs');
const { test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    // demo-* project id => emulator runs without real credentials.
    projectId: 'demo-sevenflow',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

const aliceDb = () => testEnv.authenticatedContext('alice').firestore();
const bobDb = () => testEnv.authenticatedContext('bob').firestore();
const anonDb = () => testEnv.unauthenticatedContext().firestore();

// Seed a document bypassing the rules (simulates server/Admin SDK writes).
const seed = (path, data) =>
  testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

// --- Tasks ---------------------------------------------------------------

test('owner can write and read own task day', async () => {
  const ref = doc(aliceDb(), 'users/alice/tasks/2026-06-13');
  await assertSucceeds(setDoc(ref, { date: '2026-06-13', tasks: [], updatedAt: 'x' }));
  await assertSucceeds(getDoc(ref));
});

test('other user cannot read or write foreign tasks', async () => {
  await seed('users/alice/tasks/2026-06-13', { date: '2026-06-13', tasks: [] });
  await assertFails(getDoc(doc(bobDb(), 'users/alice/tasks/2026-06-13')));
  await assertFails(setDoc(doc(bobDb(), 'users/alice/tasks/2026-06-13'), { tasks: [] }));
});

test('unauthenticated access is denied', async () => {
  await assertFails(getDoc(doc(anonDb(), 'users/alice/tasks/2026-06-13')));
  await assertFails(setDoc(doc(anonDb(), 'users/alice/backlogs/data'), { backlogs: {} }));
});

// --- Backlogs ------------------------------------------------------------

test('owner can write own backlogs and titles', async () => {
  await assertSucceeds(setDoc(doc(aliceDb(), 'users/alice/backlogs/data'), { backlogs: { inbox: [] } }));
  await assertSucceeds(setDoc(doc(aliceDb(), 'users/alice/backlogs/titles'), { titles: {} }));
});

test('other user cannot write foreign backlogs', async () => {
  await assertFails(setDoc(doc(bobDb(), 'users/alice/backlogs/data'), { backlogs: {} }));
});

// --- Settings (server-managed field separation) --------------------------

test('owner can read own settings', async () => {
  await seed('users/alice/settings/preferences', { theme: 'dark' });
  await assertSucceeds(getDoc(doc(aliceDb(), 'users/alice/settings/preferences')));
});

test('other user cannot read foreign settings', async () => {
  await seed('users/alice/settings/preferences', { theme: 'dark' });
  await assertFails(getDoc(doc(bobDb(), 'users/alice/settings/preferences')));
});

test('owner can create plain settings without protected fields', async () => {
  const ref = doc(aliceDb(), 'users/alice/settings/preferences');
  await assertSucceeds(setDoc(ref, { theme: 'dark', language: 'de' }));
});

test('owner can update non-protected settings via merge', async () => {
  await seed('users/alice/settings/preferences', { theme: 'dark' });
  const ref = doc(aliceDb(), 'users/alice/settings/preferences');
  await assertSucceeds(setDoc(ref, { theme: 'light' }, { merge: true }));
});

test('owner cannot create settings carrying an apiAccess field', async () => {
  const ref = doc(aliceDb(), 'users/alice/settings/preferences');
  await assertFails(setDoc(ref, { apiAccess: { enabled: true } }));
});

test('owner cannot flip apiAccess.enabled on existing settings', async () => {
  await seed('users/alice/settings/preferences', { apiAccess: { enabled: false } });
  const ref = doc(aliceDb(), 'users/alice/settings/preferences');
  await assertFails(setDoc(ref, { apiAccess: { enabled: true } }, { merge: true }));
});

// Mirrors the backup-import write: a full settings payload that intentionally
// omits the server-managed field must be accepted, even when apiAccess
// already exist on the server (merge:true leaves them untouched).
test('owner can write a full import-shaped settings payload (no apiAccess)', async () => {
  await seed('users/alice/settings/preferences', {
    theme: 'dark',
    apiAccess: { enabled: true },
  });
  const ref = doc(aliceDb(), 'users/alice/settings/preferences');
  await assertSucceeds(
    setDoc(
      ref,
      {
        theme: 'light',
        language: 'de',
        timeFormat: '24h',
        viewMode: 'week',
        currentView: 7,
        notesPadText: 'imported',
        mainView: 'week',
      },
      { merge: true }
    )
  );
});
