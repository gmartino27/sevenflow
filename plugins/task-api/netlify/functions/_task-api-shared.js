const crypto = require('crypto');
const { initFirebaseAdmin, json, getHeader, verifyUserFromEvent } = require('./_firebase-shared');

function isTaskApiPluginEnabled() {
  return String(process.env.SEVENFLOW_PLUGINS || '')
    .split(',')
    .map((plugin) => plugin.trim())
    .includes('task-api');
}

function requireTaskApiPlugin() {
  if (!isTaskApiPluginEnabled()) {
    throw new Error('task-api-plugin-disabled');
  }
}

function getApiEncryptionSecret() {
  const secret = process.env.TASK_API_ENCRYPTION_SECRET || '';
  if (!secret) throw new Error('missing-task-api-encryption-secret');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptApiKey(plainText) {
  const iv = crypto.randomBytes(12);
  const key = getApiEncryptionSecret();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    content: encrypted.toString('base64')
  };
}

function decryptApiKey(payload) {
  if (!payload || !payload.iv || !payload.tag || !payload.content) {
    throw new Error('missing-api-key-payload');
  }
  const key = getApiEncryptionSecret();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.content, 'base64')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function createApiKey() {
  return `sfapi_${crypto.randomBytes(32).toString('base64url')}`;
}

function getUsageDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

async function loadUserSettings(uid) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const ref = db.doc(`users/${uid}/settings/preferences`);
  const snap = await ref.get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function saveApiAccess(uid, patch) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const ref = db.doc(`users/${uid}/settings/preferences`);
  await ref.set(
    {
      apiAccess: {
        ...(patch || {}),
        updatedAt: new Date().toISOString()
      }
    },
    { merge: true }
  );
}

async function loadApiAccess(uid) {
  const settings = await loadUserSettings(uid);
  return settings.apiAccess || {};
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function verifyApiRequest(event) {
  requireTaskApiPlugin();

  const userId = getHeader(event.headers, 'x-sevenflow-user-id');
  const apiKey = getHeader(event.headers, 'x-sevenflow-api-key');
  if (!userId || !apiKey) {
    throw new Error('missing-api-auth');
  }

  const apiAccess = await loadApiAccess(userId);
  if (!apiAccess || !apiAccess.enabled || !apiAccess.secret) {
    throw new Error('api-disabled');
  }

  const decrypted = decryptApiKey(apiAccess.secret);
  if (!safeEqual(decrypted, apiKey)) {
    throw new Error('invalid-api-key');
  }

  return { uid: userId, apiAccess };
}

async function consumeDailyApiQuota(uid, limit = 100) {
  const app = initFirebaseAdmin();
  const db = app.firestore();
  const ref = db.doc(`users/${uid}/settings/preferences`);
  const usageDate = getUsageDateKey();

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const apiAccess = data.apiAccess || {};
    const currentUsage = apiAccess.usage || {};
    const currentCount = currentUsage.date === usageDate ? Number(currentUsage.count || 0) : 0;

    if (currentCount >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        date: usageDate
      };
    }

    const nextCount = currentCount + 1;
    tx.set(ref, {
      apiAccess: {
        usage: {
          date: usageDate,
          count: nextCount
        },
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - nextCount),
      date: usageDate
    };
  });

  return result;
}

function getQuotaStatus(apiAccess, limit = 100) {
  const usageDate = getUsageDateKey();
  const usage = apiAccess && apiAccess.usage ? apiAccess.usage : {};
  const count = usage.date === usageDate ? Number(usage.count || 0) : 0;
  return {
    limit,
    remaining: Math.max(0, limit - count),
    date: usageDate
  };
}

module.exports = {
  json,
  verifyUserFromEvent,
  createApiKey,
  encryptApiKey,
  decryptApiKey,
  loadApiAccess,
  saveApiAccess,
  verifyApiRequest,
  consumeDailyApiQuota,
  getQuotaStatus,
  getUsageDateKey,
  requireTaskApiPlugin,
  isTaskApiPluginEnabled
};
