const admin = require('firebase-admin');

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  };
}

function getHeader(headers, key) {
  if (!headers) return '';
  return headers[key] || headers[key.toLowerCase()] || '';
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (!raw) throw new Error('missing-firebase-service-account-json');

  const serviceAccount = JSON.parse(raw);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function verifyUserFromEvent(event) {
  const authHeader = getHeader(event.headers, 'authorization');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    throw new Error('missing-auth-token');
  }

  const app = initFirebaseAdmin();
  return app.auth().verifyIdToken(token);
}

module.exports = {
  json,
  getHeader,
  initFirebaseAdmin,
  verifyUserFromEvent
};
