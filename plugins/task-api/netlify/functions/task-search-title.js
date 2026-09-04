const { initFirebaseAdmin } = require('./_firebase-shared');
const { json, verifyApiRequest, consumeDailyApiQuota, getUsageDateKey } = require('./_task-api-shared');

const SEARCH_WINDOW_DAYS = 90;

function normalizeDateKey(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeNeedle(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesTitle(task, needle) {
  const title = String(task && task.text ? task.text : '').toLowerCase();
  return !!title && title.includes(needle);
}

function mapHit(task, location) {
  return {
    id: task.id,
    title: task.text || '',
    description: task.description || '',
    eventTime: task.eventTime || null,
    deadlineDate: task.deadlineDate || null,
    completed: !!task.completed,
    location
  };
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
    const needle = normalizeNeedle(query.title);
    const dateFilter = normalizeDateKey(query.date);

    if (!needle) {
      return json(400, { error: 'missing-title-query' });
    }

    const app = initFirebaseAdmin();
    const db = app.firestore();
    const hits = [];

    if (dateFilter) {
      const ref = db.doc(`users/${uid}/tasks/${dateFilter}`);
      const snap = await ref.get();
      const tasks = snap.exists && Array.isArray((snap.data() || {}).tasks) ? (snap.data() || {}).tasks : [];
      tasks.forEach((task) => {
        if (matchesTitle(task, needle)) {
          hits.push(mapHit(task, { type: 'date', date: dateFilter }));
        }
      });
    } else {
      const todayKey = getUsageDateKey();
      const windowStartKey = addDaysToDateKey(todayKey, -(SEARCH_WINDOW_DAYS - 1));
      // Date-string doc IDs (YYYY-MM-DD) sort lexicographically, so this bounds the
      // Firestore read itself to the window instead of scanning the full history.
      const tasksSnap = await db.collection(`users/${uid}/tasks`)
        .orderBy('__name__')
        .startAt(windowStartKey)
        .endAt(todayKey)
        .get();
      tasksSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const dateKey = data.date || docSnap.id;
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        tasks.forEach((task) => {
          if (matchesTitle(task, needle)) {
            hits.push(mapHit(task, { type: 'date', date: dateKey }));
          }
        });
      });

      const backlogSnap = await db.doc(`users/${uid}/backlogs/data`).get();
      if (backlogSnap.exists) {
        const backlogs = (backlogSnap.data() || {}).backlogs || {};
        Object.entries(backlogs).forEach(([backlogId, tasks]) => {
          if (!Array.isArray(tasks)) return;
          tasks.forEach((task) => {
            if (matchesTitle(task, needle)) {
              hits.push(mapHit(task, { type: 'backlog', backlogId }));
            }
          });
        });
      }
    }

    return json(200, {
      ok: true,
      query: needle,
      count: hits.length,
      tasks: hits,
      limit: quota.limit,
      remaining: quota.remaining,
      searchWindowDays: dateFilter ? null : SEARCH_WINDOW_DAYS,
      note: dateFilter
        ? null
        : `Date search limited to the last ${SEARCH_WINDOW_DAYS} days. Backlog items are always searched in full. Use the "date" parameter for an exact-day lookup outside this window.`
    });
  } catch (error) {
    const code = error.message === 'task-api-plugin-disabled' ? 404 : (['missing-api-auth', 'api-disabled', 'invalid-api-key'].includes(error.message) ? 401 : 400);
    return json(code, { error: error.message || 'task-search-title-failed' });
  }
};

