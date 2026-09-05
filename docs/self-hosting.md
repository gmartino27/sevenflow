# Self-Hosting SevenFlow

SevenFlow currently ships with two deployment modes:

- hosted Firebase mode
- local JSON mode without Firebase

## Local JSON Mode

Use this when you want to run SevenFlow without Firebase and without Netlify:

```bash
npm install
npm run start:local
```

Open `http://127.0.0.1:8000/login.html`.

Default local credentials:

- Email: `admin@sevenflow.local`
- Password: `sevenflow`

Local data is stored in `.sevenflow-data/data.json`.

## Docker Compose

Use this when you want the fastest self-hosted setup with persistent local JSON storage. Make sure Docker is running first.

```bash
docker compose up --build
```

Open `http://localhost:8000/login.html`.

Default Docker credentials:

- Email: `admin@sevenflow.local`
- Password: `sevenflow`

Data is stored in the `sevenflow-data` Docker volume. Before exposing SevenFlow to another device or network, change the credentials and session secret in `docker-compose.yml`.

Change the credentials before exposing the server outside your machine:

```bash
SEVENFLOW_LOCAL_USER_EMAIL=you@example.com
SEVENFLOW_LOCAL_USER_PASSWORD=change-me
SEVENFLOW_LOCAL_SESSION_SECRET=change-this-too
```

## Hosted Firebase Mode

Use this when you want the original Firebase-backed web app:

```bash
npm install
npm run build
python3 -m http.server 8000
```

This can also be uploaded to any static host after `npm run build`.

## Node Server

Use this when you want the Firebase-backed app plus `/api/...` routes without Netlify:

```bash
npm install
npm start
```

Set the following values in `.env`:

```bash
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
TASK_API_ENCRYPTION_SECRET=
FIREBASE_SERVICE_ACCOUNT_JSON=
SEVENFLOW_PLUGINS=task-api
```

The default URL is `http://localhost:8000`. Change it with:

```bash
PORT=3000 npm start
```

## Production Server

For a real server, run the Node process behind HTTPS:

- Caddy
- nginx
- Apache reverse proxy
- a PaaS that supports Node.js
- the included Docker Compose setup

## Optional Plugins

Enable bundled plugins with `SEVENFLOW_PLUGINS`:

```bash
SEVENFLOW_PLUGINS=ramble,task-api,google-login,google-calendar
```

Available bundled plugins:

- `ramble`: voice/text task capture and local parsing
- `task-api`: API key management and `/api/tasks/...` routes
- `google-login`: Google login/register buttons
- `google-calendar`: Google Calendar sync settings

See `docs/plugins.md` for plugin-specific setup. The local JSON mode does not enable plugins by default.

## Production Firebase-Free Target

The local JSON mode is useful for testing and private local use. A production Firebase-free backend should eventually provide:

- user accounts
- task storage
- backlog and inbox storage
- settings storage
- recurring task persistence
- attachment storage
- realtime or polling sync
- backup/export support
