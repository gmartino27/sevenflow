// Unit tests for js/sevenflow/backlog-tombstones.js — the pure Set logic behind
// sevenflow.js's delete-tombstone tracking. No window/DOM shim needed: the module
// exports via module.exports when running under Node.
//
//   node --test test/backlog-tombstones.test.js
// (also picked up by `npm run test:rules`, which globs test/*.test.js)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  backlogTombstoneKeysForTask,
  addBacklogTombstone,
  removeBacklogTombstone,
  snapshotBacklogTombstones,
  pruneBacklogTombstones
} = require('../js/sevenflow/backlog-tombstones');

function emptyStore() {
  return { '1': new Set(), '2': new Set(), '3': new Set(), inbox: new Set() };
}

test('backlogTombstoneKeysForTask: keys by id and, when present, sourceUrl', () => {
  assert.deepEqual(backlogTombstoneKeysForTask({ id: 5 }), ['id:5']);
  assert.deepEqual(
    backlogTombstoneKeysForTask({ id: 5, sourceUrl: 'https://trello.example/card/1' }),
    ['id:5', 'source:https://trello.example/card/1']
  );
  assert.deepEqual(backlogTombstoneKeysForTask(null), []);
});

test('addBacklogTombstone: records both id and sourceUrl keys for the given backlog', () => {
  const store = emptyStore();
  addBacklogTombstone(store, 'inbox', { id: 5, sourceUrl: 'https://trello.example/card/1' });

  assert.ok(store.inbox.has('id:5'));
  assert.ok(store.inbox.has('source:https://trello.example/card/1'));
  // Other backlogs are untouched.
  assert.equal(store['1'].size, 0);
});

// This is the exact "undo" requirement: deleting a task tombstones it, undoing
// that delete must remove the tombstone again so a later save's merge step is
// free to treat the (now-restored) task normally again.
test('delete then undo: removeBacklogTombstone reverses exactly what addBacklogTombstone added', () => {
  const store = emptyStore();
  const task = { id: 5, sourceUrl: 'https://trello.example/card/1' };

  addBacklogTombstone(store, 'inbox', task);
  assert.ok(store.inbox.has('id:5'));
  assert.ok(store.inbox.has('source:https://trello.example/card/1'));

  removeBacklogTombstone(store, 'inbox', task);
  assert.equal(store.inbox.has('id:5'), false);
  assert.equal(store.inbox.has('source:https://trello.example/card/1'), false);
  assert.equal(store.inbox.size, 0);
});

test('removeBacklogTombstone: a no-op for a backlog that has no tombstones yet', () => {
  const store = emptyStore();
  assert.doesNotThrow(() => removeBacklogTombstone(store, 'inbox', { id: 5 }));
});

test('snapshotBacklogTombstones: returns plain arrays, independent of the live Sets', () => {
  const store = emptyStore();
  addBacklogTombstone(store, 'inbox', { id: 5 });

  const snapshot = snapshotBacklogTombstones(store);
  assert.deepEqual(snapshot.inbox, ['id:5']);

  // Mutating the live store after snapshotting must not affect the snapshot.
  addBacklogTombstone(store, 'inbox', { id: 6 });
  assert.deepEqual(snapshot.inbox, ['id:5']);
});

test('pruneBacklogTombstones: removes only the keys in the snapshot, not ones added after it was taken', () => {
  const store = emptyStore();
  addBacklogTombstone(store, 'inbox', { id: 5 });
  const snapshot = snapshotBacklogTombstones(store);

  // Another delete races in after the snapshot was taken (e.g. save in flight).
  addBacklogTombstone(store, 'inbox', { id: 6 });

  const changed = pruneBacklogTombstones(store, snapshot);

  assert.equal(changed, true);
  assert.equal(store.inbox.has('id:5'), false);
  assert.equal(store.inbox.has('id:6'), true, 'tombstone added after the snapshot must survive the prune');
});

test('pruneBacklogTombstones: returns false when nothing in the snapshot was still present', () => {
  const store = emptyStore();
  const snapshot = { inbox: ['id:5'] }; // never actually added
  assert.equal(pruneBacklogTombstones(store, snapshot), false);
});
