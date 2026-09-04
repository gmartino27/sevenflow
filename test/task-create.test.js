// Tests for the task-create Netlify function's Firestore write logic (run against
// the Firestore emulator, same as firestore.rules.test.js).
//
//   npm run test:rules
//
// This talks to the Firestore emulator directly via the Admin SDK (bypasses security
// rules, same as the real Netlify function does with a service account) instead of
// initializing the function's own initFirebaseAdmin(), which requires a real
// FIREBASE_SERVICE_ACCOUNT_JSON. The emulator's FIRESTORE_EMULATOR_HOST env var
// (set automatically by `firebase emulators:exec`) makes the Admin SDK connect to
// the emulator without any credentials.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const { _internal } = require('../netlify/functions/task-create');

const { buildTask, insertDateTask, insertBacklogTask } = _internal;

let app;
let db;

before(() => {
  app = admin.initializeApp({ projectId: 'demo-sevenflow-task-create' }, 'task-create-test');
  db = app.firestore();
});

after(async () => {
  if (app) await app.delete();
});

beforeEach(async () => {
  // Clear both docs used by the tests below.
  await db.recursiveDelete(db.collection('users'));
});

const UID = 'alice';
const DATE_KEY = '2026-06-13';

test('insertDateTask: sequential creates all land in the array', async () => {
  await insertDateTask(db, UID, DATE_KEY, buildTask({ title: 'Task A' }));
  await insertDateTask(db, UID, DATE_KEY, buildTask({ title: 'Task B' }));
  await insertDateTask(db, UID, DATE_KEY, buildTask({ title: 'Task C' }));

  const snap = await db.doc(`users/${UID}/tasks/${DATE_KEY}`).get();
  const tasks = snap.data().tasks;
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((t) => t.text).sort(), ['Task A', 'Task B', 'Task C']);
});

// This is the exact bug reported: firing several creates for the same day back to
// back used to lose tasks because each request did an unguarded read -> modify ->
// set on the same document. With the transaction in place, every concurrent request
// must end up reflected in the final array.
test('insertDateTask: concurrent creates against the same day do not lose updates', async () => {
  const count = 15;
  const tasks = Array.from({ length: count }, (_, i) => buildTask({ title: `Concurrent ${i}` }));

  await Promise.all(tasks.map((task) => insertDateTask(db, UID, DATE_KEY, task)));

  const snap = await db.doc(`users/${UID}/tasks/${DATE_KEY}`).get();
  const stored = snap.data().tasks;
  assert.equal(stored.length, count, `expected all ${count} concurrent creates to be present, got ${stored.length}`);

  const storedTitles = new Set(stored.map((t) => t.text));
  for (const task of tasks) {
    assert.ok(storedTitles.has(task.text), `missing task: ${task.text}`);
  }
});

test('insertBacklogTask: concurrent creates against the same backlog do not lose updates', async () => {
  const count = 15;
  const tasks = Array.from({ length: count }, (_, i) => buildTask({ title: `Backlog ${i}` }));

  await Promise.all(tasks.map((task) => insertBacklogTask(db, UID, 'inbox', task)));

  const snap = await db.doc(`users/${UID}/backlogs/data`).get();
  const stored = snap.data().backlogs.inbox;
  assert.equal(stored.length, count);
});

test('buildTask: accepts sourceUrl or the legacy trelloUrl alias', () => {
  const viaSourceUrl = buildTask({ title: 'A', sourceUrl: 'https://trello.example/card/1' });
  assert.equal(viaSourceUrl.sourceUrl, 'https://trello.example/card/1');

  const viaTrelloUrl = buildTask({ title: 'B', trelloUrl: 'https://trello.example/card/2' });
  assert.equal(viaTrelloUrl.sourceUrl, 'https://trello.example/card/2');

  const withoutEither = buildTask({ title: 'C' });
  assert.equal(withoutEither.sourceUrl, null);
});

test('insertDateTask: second create with the same sourceUrl is reported as a duplicate, not inserted', async () => {
  const first = buildTask({ title: 'Imported card', sourceUrl: 'https://trello.example/card/42' });
  const firstResult = await insertDateTask(db, UID, DATE_KEY, first);
  assert.equal(firstResult.duplicate, false);

  const second = buildTask({ title: 'Imported card (retry)', sourceUrl: 'https://trello.example/card/42' });
  const secondResult = await insertDateTask(db, UID, DATE_KEY, second);
  assert.equal(secondResult.duplicate, true);
  assert.equal(secondResult.taskId, first.id);

  const snap = await db.doc(`users/${UID}/tasks/${DATE_KEY}`).get();
  assert.equal(snap.data().tasks.length, 1);
});

// The dedupe check and the insert both happen inside the same transaction, so this
// isn't just "check then insert" racing itself: two concurrent creates for the same
// sourceUrl must still converge on exactly one stored task.
test('insertDateTask: concurrent creates with the same sourceUrl only insert once', async () => {
  const sourceUrl = 'https://trello.example/card/99';
  const attempts = Array.from({ length: 10 }, (_, i) => buildTask({ title: `Race ${i}`, sourceUrl }));

  const results = await Promise.all(attempts.map((task) => insertDateTask(db, UID, DATE_KEY, task)));

  const snap = await db.doc(`users/${UID}/tasks/${DATE_KEY}`).get();
  const stored = snap.data().tasks.filter((t) => t.sourceUrl === sourceUrl);
  assert.equal(stored.length, 1, `expected exactly one task for the shared sourceUrl, got ${stored.length}`);

  const duplicateCount = results.filter((r) => r.duplicate).length;
  assert.equal(duplicateCount, attempts.length - 1);
});

test('insertDateTask: tasks without a sourceUrl are never treated as duplicates of each other', async () => {
  await insertDateTask(db, UID, DATE_KEY, buildTask({ title: 'No url 1' }));
  await insertDateTask(db, UID, DATE_KEY, buildTask({ title: 'No url 2' }));

  const snap = await db.doc(`users/${UID}/tasks/${DATE_KEY}`).get();
  assert.equal(snap.data().tasks.length, 2);
});
