const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

require('./create-firebase-config');

const rootDir = __dirname;
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '127.0.0.1';
const localDataDir = path.join(rootDir, '.sevenflow-data');
const localDataFile = path.join(localDataDir, 'data.json');

function enabledPlugins() {
  return String(process.env.SEVENFLOW_PLUGINS || '')
    .split(',')
    .map((plugin) => plugin.trim())
    .filter(Boolean);
}

const apiRoutes = enabledPlugins().includes('task-api')
  ? {
      '/api/task-api/key': './netlify/functions/task-api-key',
      '/api/tasks/create': './netlify/functions/task-create',
      '/api/tasks/read-day': './netlify/functions/task-read-day',
      '/api/tasks/search-title': './netlify/functions/task-search-title'
    }
  : {};

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy(new Error('request-body-too-large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : value])
  );
}

function isLocalAuthEnabled() {
  return process.env.SEVENFLOW_LOCAL_AUTH === 'true';
}

function getLocalUser() {
  return {
    uid: process.env.SEVENFLOW_LOCAL_USER_ID || 'local-user',
    email: process.env.SEVENFLOW_LOCAL_USER_EMAIL || '',
    password: process.env.SEVENFLOW_LOCAL_USER_PASSWORD || '',
    displayName: 'Local User'
  };
}

function getLocalToken(user) {
  const secret = process.env.SEVENFLOW_LOCAL_SESSION_SECRET || user.password || 'sevenflow-local-session';
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${user.uid}:${user.email}`)
    .digest('base64url');
  return `sflocal_${digest}`;
}

function publicLocalUser(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName
  };
}

function readLocalData() {
  try {
    const raw = fs.readFileSync(localDataFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { users: {} };
  }
}

function writeLocalData(data) {
  fs.mkdirSync(localDataDir, { recursive: true });
  const tmpFile = `${localDataFile}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, localDataFile);
}

function getDefaultLocalState() {
  return {
    tasks: {},
    backlogs: { '1': [], '2': [], '3': [], inbox: [] },
    backlogTitles: { '1': 'This week', '2': 'Next week', '3': 'Later' },
    settings: { defaultView: 7 }
  };
}

function getLocalUserState(data, uid) {
  data.users = data.users || {};
  data.users[uid] = {
    ...getDefaultLocalState(),
    ...(data.users[uid] || {})
  };
  data.users[uid].backlogs = {
    '1': [],
    '2': [],
    '3': [],
    inbox: [],
    ...(data.users[uid].backlogs || {})
  };
  data.users[uid].backlogTitles = {
    '1': 'This week',
    '2': 'Next week',
    '3': 'Later',
    ...(data.users[uid].backlogTitles || {})
  };
  return data.users[uid];
}

function verifyLocalRequest(req) {
  const user = getLocalUser();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== getLocalToken(user)) {
    throw new Error('invalid-local-session');
  }
  return user;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function handleLocalApi(req, res, parsedUrl) {
  if (!parsedUrl.pathname.startsWith('/local-api/')) return false;
  if (!isLocalAuthEnabled()) {
    sendJson(res, 404, { error: 'local-auth-disabled' });
    return true;
  }

  if (parsedUrl.pathname === '/local-api/login' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const user = getLocalUser();
    if (!user.email || !user.password) {
      sendJson(res, 500, { error: 'local-user-not-configured' });
      return true;
    }
    if (body.email !== user.email || body.password !== user.password) {
      sendJson(res, 401, { error: 'auth/invalid-credential' });
      return true;
    }

    const data = readLocalData();
    getLocalUserState(data, user.uid);
    writeLocalData(data);

    sendJson(res, 200, {
      token: getLocalToken(user),
      user: publicLocalUser(user)
    });
    return true;
  }

  if (parsedUrl.pathname === '/local-api/session' && req.method === 'GET') {
    const user = verifyLocalRequest(req);
    sendJson(res, 200, { user: publicLocalUser(user) });
    return true;
  }

  if (parsedUrl.pathname === '/local-api/state' && req.method === 'GET') {
    const user = verifyLocalRequest(req);
    const data = readLocalData();
    const state = getLocalUserState(data, user.uid);
    writeLocalData(data);
    sendJson(res, 200, state);
    return true;
  }

  if (parsedUrl.pathname === '/local-api/state' && req.method === 'POST') {
    const user = verifyLocalRequest(req);
    const patch = JSON.parse(await readBody(req) || '{}');
    const data = readLocalData();
    const state = getLocalUserState(data, user.uid);

    if (patch.tasks && typeof patch.tasks === 'object') {
      state.tasks = patch.tasks;
    }
    if (patch.taskDates && typeof patch.taskDates === 'object') {
      state.tasks = state.tasks || {};
      Object.entries(patch.taskDates).forEach(([dateKey, tasks]) => {
        state.tasks[dateKey] = Array.isArray(tasks) ? tasks : [];
      });
    }
    if (patch.backlogs && typeof patch.backlogs === 'object') {
      state.backlogs = {
        '1': [],
        '2': [],
        '3': [],
        inbox: [],
        ...patch.backlogs
      };
    }
    if (patch.backlogTitles && typeof patch.backlogTitles === 'object') {
      state.backlogTitles = {
        ...(state.backlogTitles || {}),
        ...patch.backlogTitles
      };
    }
    if (patch.settings && typeof patch.settings === 'object') {
      state.settings = {
        ...(state.settings || {}),
        ...patch.settings,
        updatedAt: new Date().toISOString()
      };
    }

    writeLocalData(data);
    sendJson(res, 200, { ok: true });
    return true;
  }

  sendJson(res, 404, { error: 'local-api-not-found' });
  return true;
}

async function handleApi(req, res, parsedUrl) {
  const route = apiRoutes[parsedUrl.pathname];
  if (!route) return false;

  const handler = require(route).handler;
  const body = await readBody(req);
  const queryStringParameters = Object.fromEntries(parsedUrl.searchParams.entries());

  const result = await handler({
    httpMethod: req.method,
    path: parsedUrl.pathname,
    rawUrl: parsedUrl.toString(),
    headers: normalizeHeaders(req.headers),
    queryStringParameters,
    body
  });

  res.writeHead(result.statusCode || 200, result.headers || {});
  res.end(result.body || '');
  return true;
}

function sendStatic(req, res, parsedUrl) {
  const requestPath = decodeURIComponent(parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname);
  const filePath = path.normalize(path.join(rootDir, requestPath));

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      'content-type': mimeTypes[ext] || 'application/octet-stream',
      'x-content-type-options': 'nosniff'
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
    if (await handleLocalApi(req, res, parsedUrl)) return;
    if (await handleApi(req, res, parsedUrl)) return;
    sendStatic(req, res, parsedUrl);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message || 'server-error' }));
  }
});

server.listen(port, host, () => {
  console.log(`SevenFlow running at http://${host}:${port}`);
});
