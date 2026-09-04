const {
  json,
  verifyUserFromEvent,
  createApiKey,
  encryptApiKey,
  decryptApiKey,
  loadApiAccess,
  saveApiAccess,
  getQuotaStatus,
  requireTaskApiPlugin
} = require('./_task-api-shared');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return json(405, { error: 'method-not-allowed' });
  }

  try {
    requireTaskApiPlugin();
    const decoded = await verifyUserFromEvent(event);

    if (event.httpMethod === 'GET') {
      const apiAccess = await loadApiAccess(decoded.uid);
      if (!apiAccess || !apiAccess.enabled || !apiAccess.secret) {
        return json(404, { error: 'api-key-not-found' });
      }
      const quota = getQuotaStatus(apiAccess, 100);
      return json(200, {
        apiKey: decryptApiKey(apiAccess.secret),
        createdAt: apiAccess.createdAt || null,
        ...quota
      });
    }

    const existing = await loadApiAccess(decoded.uid);
    if (existing && existing.enabled && existing.secret) {
      const quota = getQuotaStatus(existing, 100);
      return json(200, {
        apiKey: decryptApiKey(existing.secret),
        createdAt: existing.createdAt || null,
        ...quota
      });
    }

    const apiKey = createApiKey();
    const createdAt = new Date().toISOString();
    await saveApiAccess(decoded.uid, {
      enabled: true,
      createdAt,
      secret: encryptApiKey(apiKey)
    });

    return json(200, {
      apiKey,
      createdAt,
      limit: 100,
      remaining: 100,
      date: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Zurich',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date())
    });
  } catch (error) {
    const status = error && error.message === 'task-api-plugin-disabled' ? 404 : 500;
    return json(status, { error: 'task-api-key-failed', details: error.message });
  }
};
