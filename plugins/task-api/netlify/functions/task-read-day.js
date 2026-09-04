const { initFirebaseAdmin } = require('./_firebase-shared');
const { json, verifyApiRequest, consumeDailyApiQuota, getUsageDateKey } = require('./_task-api-shared');

function normalizeDateKey(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
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

    const query = event.queryStringParameters || {};
    const dateKey = normalizeDateKey(query.date) || getUsageDateKey();

    const app = initFirebaseAdmin();
    const db = app.firestore();
    const ref = db.doc(`users/${uid}/tasks/${dateKey}`);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];

    return json(200, {
      ok: true,
      date: dateKey,
      count: tasks.length,
      tasks,
      limit: quota.limit,
      remaining: quota.remaining
    });
  } catch (error) {
    const code = error.message === 'task-api-plugin-disabled' ? 404 : (['missing-api-auth', 'api-disabled', 'invalid-api-key'].includes(error.message) ? 401 : 400);
    return json(code, { error: error.message || 'task-read-day-failed' });
  }
};

