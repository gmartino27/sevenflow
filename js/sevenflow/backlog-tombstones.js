// Pure helpers for backlog/inbox delete-tombstones.
//
// Keyed like firestore.js's mergeBacklogTasks() dedup keys ("id:<id>" /
// "source:<sourceUrl>") so a tombstone set can be handed straight to
// firestoreManager.saveBacklogs() without re-mapping. Kept in its own file (no
// `app`/DOM dependency) so it's independently testable — see
// test/backlog-tombstones.test.js.

function backlogTombstoneKeysForTask(task) {
    const keys = [];
    if (task && task.id !== undefined && task.id !== null) keys.push(`id:${task.id}`);
    if (task && task.sourceUrl) keys.push(`source:${task.sourceUrl}`);
    return keys;
}

function addBacklogTombstone(tombstonesByBacklog, backlogId, task) {
    const set = tombstonesByBacklog[backlogId] || (tombstonesByBacklog[backlogId] = new Set());
    backlogTombstoneKeysForTask(task).forEach((key) => set.add(key));
}

function removeBacklogTombstone(tombstonesByBacklog, backlogId, task) {
    const set = tombstonesByBacklog[backlogId];
    if (!set) return;
    backlogTombstoneKeysForTask(task).forEach((key) => set.delete(key));
}

function snapshotBacklogTombstones(tombstonesByBacklog) {
    const snapshot = {};
    Object.keys(tombstonesByBacklog).forEach((backlogId) => {
        snapshot[backlogId] = [...tombstonesByBacklog[backlogId]];
    });
    return snapshot;
}

// Only safe to call once the save that used this exact snapshot has committed —
// at that point the just-written remote doc no longer contains the deleted
// tasks, so these tombstones have done their job. Returns whether anything
// actually changed, so the caller only needs to re-persist when it did.
function pruneBacklogTombstones(tombstonesByBacklog, snapshot) {
    let changed = false;
    Object.keys(snapshot).forEach((backlogId) => {
        const set = tombstonesByBacklog[backlogId];
        if (!set) return;
        snapshot[backlogId].forEach((key) => {
            if (set.delete(key)) changed = true;
        });
    });
    return changed;
}

const BacklogTombstones = {
    backlogTombstoneKeysForTask,
    addBacklogTombstone,
    removeBacklogTombstone,
    snapshotBacklogTombstones,
    pruneBacklogTombstones
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BacklogTombstones;
}
if (typeof window !== 'undefined') {
    window.BacklogTombstones = BacklogTombstones;
}
