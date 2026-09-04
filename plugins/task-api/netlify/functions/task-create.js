const { initFirebaseAdmin } = require('./_firebase-shared');
const { json, verifyApiRequest, consumeDailyApiQuota } = require('./_task-api-shared');

function normalizeDateKey(value) {
  if (typeof value !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function normalizeSourceUrl(body) {
  const raw = typeof body.sourceUrl === 'string' && body.sourceUrl.trim()
    ? body.sourceUrl
    : (typeof body.trelloUrl === 'string' ? body.trelloUrl : '');
  const trimmed = raw.trim();
  return trimmed || null;
}

function buildTask(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    throw new Error('missing-title');
  }

  return {
    id: Date.now() + Math.random(),
    text: title,
    description: typeof body.description === 'string' ? body.description : '',
    completed: false,
    recurring: 'none',
    recurringId: null,
    recurringOrder: null,
    reminderEnabled: !!(body.reminderEnabled && body.reminderTime),
    reminderTime: typeof body.reminderTime === 'string' ? body.reminderTime : null,
    eventTime: typeof body.eventTime === 'string' ? body.eventTime : null,
    deadlineDate: normalizeDateKey(body.deadlineDate) || null,
    color: typeof body.color === 'string' ? body.color : 'none',
    tags: Array.isArray(body.tags) ? body.tags.filter((tag) => typeof tag === 'string') : [],
    subtasks: [],
    attachments: [],
    // Accepts either `sourceUrl` or the legacy `trelloUrl` name from the client, but
    // always stores/dedupes under this one field.
    sourceUrl: normalizeSourceUrl(body),
    createdAt: new Date().toISOString()
  };
}

function findBySourceUrl(tasks, sourceUrl) {
  if (!sourceUrl) return null;
  return tasks.find((t) => t && t.sourceUrl === sourceUrl) || null;
}

function isRetryableTransactionError(error) {
  const message = String((error && (error.details || error.message)) || '').toLowerCase();
  return error && (
    error.code === 10 ||
    message.includes('aborted') ||
    message.includes('transaction lock timeout')
  );
}

async function runTransactionWithRetry(db, callback, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await db.runTransaction(callback);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt * attempt));
    }
  }
  throw lastError;
}

// Atomically read-modify-write `users/{uid}/tasks/{dateKey}`.
//
// Two concurrent requests (e.g. a burst of imports) both reading the same doc,
// pushing to their own in-memory copy of `tasks`, and calling `.set()` last-write-wins
// is exactly how one create silently overwrites the other ("lost update") — the
// symptom reported: 200 OK, task missing afterwards. Firestore transactions fix this
// via optimistic concurrency: `tx.get` records the doc's read version, and the
// transaction only commits if nothing else wrote to that doc in the meantime;
// otherwise the SDK reruns the whole callback with a fresh read. So concurrent
// creates against the same date/backlog doc always serialize onto a consistent
// `tasks` array instead of racing on a stale copy — and since the sourceUrl dedupe
// check reads from that same transactional snapshot, two concurrent creates for the
// same sourceUrl can't both see "not found" and both insert.
async function insertDateTask(db, uid, dateKey, task) {
  const ref = db.doc(`users/${uid}/tasks/${dateKey}`);
  return runTransactionWithRetry(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    const existing = findBySourceUrl(tasks, task.sourceUrl);
    if (existing) {
      return { taskId: existing.id, duplicate: true };
    }

    tx.set(
      ref,
      {
        date: dateKey,
        tasks: [...tasks, task],
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    return { taskId: task.id, duplicate: false };
  });
}

// Same atomicity guarantee as insertDateTask(), for `users/{uid}/backlogs/data`
// (backlog columns + inbox all live as arrays inside this one document).
async function insertBacklogTask(db, uid, backlogId, task) {
  const ref = db.doc(`users/${uid}/backlogs/data`);
  return runTransactionWithRetry(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const backlogs = data.backlogs && typeof data.backlogs === 'object' ? { ...data.backlogs } : {};
    const list = Array.isArray(backlogs[backlogId]) ? backlogs[backlogId] : [];

    const existing = findBySourceUrl(list, task.sourceUrl);
    if (existing) {
      return { taskId: existing.id, duplicate: true };
    }

    backlogs[backlogId] = [task, ...list];
    tx.set(
      ref,
      {
        backlogs,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    return { taskId: task.id, duplicate: false };
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method-not-allowed' });
  }

  try {
    const { uid } = await verifyApiRequest(event);
    const quota = await consumeDailyApiQuota(uid, 100);
    if (!quota.allowed) {
      return json(429, {
        error: 'daily-api-limit-reached',
        limit: quota.limit,
        remaining: quota.remaining,
        resetDate: quota.date
      });
    }
    const body = JSON.parse(event.body || '{}');
    const task = buildTask(body);
    const dateKey = normalizeDateKey(body.date);
    const backlogId = ['1', '2', '3', 'inbox'].includes(String(body.backlogId || ''))
      ? String(body.backlogId)
      : '';

    const app = initFirebaseAdmin();
    const db = app.firestore();

    if (dateKey) {
      const result = await insertDateTask(db, uid, dateKey, task);
      return json(200, {
        ok: true,
        location: 'date',
        date: dateKey,
        taskId: result.taskId,
        duplicate: result.duplicate,
        limit: quota.limit,
        remaining: quota.remaining
      });
    }

    const targetBacklog = backlogId || 'inbox';
    const result = await insertBacklogTask(db, uid, targetBacklog, task);

    return json(200, {
      ok: true,
      location: targetBacklog === 'inbox' ? 'inbox' : 'backlog',
      backlogId: targetBacklog,
      taskId: result.taskId,
      duplicate: result.duplicate,
      limit: quota.limit,
      remaining: quota.remaining
    });
  } catch (error) {
    const code = error.message === 'task-api-plugin-disabled' ? 404 : (['missing-api-auth', 'api-disabled', 'invalid-api-key'].includes(error.message) ? 401 : 400);
    return json(code, { error: error.message || 'task-create-failed' });
  }
};

// Exported for testing (test/task-create.test.js runs these directly against the
// Firestore emulator, without going through the HTTP handler's API-key auth layer).
exports._internal = {
  buildTask,
  findBySourceUrl,
  insertDateTask,
  insertBacklogTask,
  isRetryableTransactionError,
  runTransactionWithRetry
};
