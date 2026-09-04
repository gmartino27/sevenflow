// Unit tests for FirestoreTaskManager's backlog merge helpers (pure functions, no
// Firestore connection needed). js/firestore.js is a plain browser script that
// attaches itself to `window`, so we shim that before requiring it.
//
//   node --test test/firestore-backlog-merge.test.js
// (also picked up by `npm run test:rules`, which globs test/*.test.js)

const { test } = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../js/firestore.js');
const { FirestoreTaskManager } = global;

const manager = new FirestoreTaskManager();

test('mergeBacklogTasks: adds remote-only tasks (by id) ahead of local, keeps local version of shared ids', () => {
  const local = [{ id: 1, text: 'Local A' }];
  const remote = [
    { id: 1, text: 'Stale remote copy of A' },
    { id: 2, text: 'API-created task' }
  ];

  const merged = manager.mergeBacklogTasks(local, remote);

  assert.deepEqual(merged.map((t) => t.id), [2, 1]);
  // Local's own copy of a task both sides know about wins over the remote version.
  assert.equal(merged.find((t) => t.id === 1).text, 'Local A');
});

test('mergeBacklogTasks: dedupes remote-only tasks by sourceUrl when ids differ', () => {
  const local = [{ id: 1, sourceUrl: 'https://trello.example/card/1' }];
  const remote = [
    { id: 99, sourceUrl: 'https://trello.example/card/1' }, // same card, different local id -> not a new task
    { id: 2, sourceUrl: 'https://trello.example/card/2' }
  ];

  const merged = manager.mergeBacklogTasks(local, remote);

  assert.deepEqual(merged.map((t) => t.id), [2, 1]);
});

test('mergeBacklogTasks: no remote tasks means nothing is added', () => {
  const merged = manager.mergeBacklogTasks([{ id: 1 }], []);
  assert.deepEqual(merged.map((t) => t.id), [1]);
});

test('mergeBacklogTasks: tolerates missing/non-array input', () => {
  assert.deepEqual(manager.mergeBacklogTasks(undefined, undefined), []);
  assert.deepEqual(manager.mergeBacklogTasks(null, [{ id: 1 }]).map((t) => t.id), [1]);
});

test('mergeBacklogsForSave: merges each of the four fixed backlog lists independently', () => {
  const local = { '1': [{ id: 1 }], '2': [], '3': [], inbox: [{ id: 10 }] };
  const remote = { '1': [{ id: 1 }, { id: 2 }], '2': [{ id: 3 }], '3': [], inbox: [] };

  const merged = manager.mergeBacklogsForSave(local, remote);

  assert.deepEqual(merged['1'].map((t) => t.id), [2, 1]);
  assert.deepEqual(merged['2'].map((t) => t.id), [3]);
  assert.deepEqual(merged['3'], []);
  assert.deepEqual(merged.inbox.map((t) => t.id), [10]);
});

// --- Delete tombstones -----------------------------------------------------
// The scenario these guard against: local deletes an inbox task, then saves
// before the server has confirmed the delete. The save's own merge step reads
// back a remote snapshot that still has the task (see saveBacklogs()'s comment
// for why that can happen even with a single client) and, without a tombstone,
// would treat it as "remote-only" and re-add it right back.

test('mergeBacklogTasks: a tombstoned id is not re-added even though it is remote-only', () => {
  // Local just deleted task 5 (it's no longer in `local` at all).
  const local = [{ id: 1, text: 'Still there' }];
  const remote = [{ id: 1, text: 'Still there' }, { id: 5, text: 'Amazon Jahresabo' }];
  const tombstones = new Set(['id:5']);

  const merged = manager.mergeBacklogTasks(local, remote, tombstones);

  assert.deepEqual(merged.map((t) => t.id), [1]);
});

test('mergeBacklogTasks: a genuinely new remote task (no tombstone) is still merged in', () => {
  const local = [{ id: 1, text: 'Still there' }];
  const remote = [{ id: 1, text: 'Still there' }, { id: 7, text: 'API-created task' }];
  const tombstones = new Set(['id:5']); // unrelated tombstone from a different delete

  const merged = manager.mergeBacklogTasks(local, remote, tombstones);

  assert.deepEqual(merged.map((t) => t.id), [7, 1]);
});

test('mergeBacklogTasks: a sourceUrl tombstone blocks re-insert even when the remote copy has a different id', () => {
  // Remote's copy of the deleted task may carry a different id than the local
  // task did (e.g. it round-tripped through another client/the API), but it's
  // still the same source card.
  const local = [];
  const remote = [{ id: 999, sourceUrl: 'https://trello.example/card/42', text: 'Amazon Jahresabo' }];
  const tombstones = new Set(['source:https://trello.example/card/42']);

  const merged = manager.mergeBacklogTasks(local, remote, tombstones);

  assert.deepEqual(merged, []);
});

test('mergeBacklogTasks: tombstones accept a plain array too, not just a Set', () => {
  const merged = manager.mergeBacklogTasks([], [{ id: 5 }], ['id:5']);
  assert.deepEqual(merged, []);
});

test('mergeBacklogsForSave: per-backlog tombstones only apply to their own list', () => {
  const local = { '1': [], '2': [], '3': [], inbox: [] };
  const remote = { '1': [{ id: 1 }], '2': [{ id: 1 }], '3': [], inbox: [] };
  // Tombstone for id 1 only applies to backlog '1' — backlog '2' has an
  // unrelated task that happens to share the same id and must survive.
  const tombstones = { '1': new Set(['id:1']) };

  const merged = manager.mergeBacklogsForSave(local, remote, tombstones);

  assert.deepEqual(merged['1'], []);
  assert.deepEqual(merged['2'].map((t) => t.id), [1]);
});
