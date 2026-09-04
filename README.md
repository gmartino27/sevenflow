# SevenFlow

SevenFlow is an open-source task planning app focused on weekly planning, inbox capture, recurring tasks, reminders, backlog columns, backup export/import, and optional API access.

SevenFlow supports two operating modes:

- hosted mode with Firebase and optional Netlify Functions
- local self-hosted mode with the bundled Node server and JSON file storage

The hosted Firebase/Netlify setup remains supported for existing installations. The local mode is intended for people who want to run SevenFlow on their own computer or server without creating Firebase or Netlify accounts.

## Features

- Weekly task planning with desktop 3, 5, or 7 day views and mobile 1, 3, or 5 day views
- Inbox for unscheduled tasks
- Three backlog columns
- Recurring tasks
- Reminders
- Tags, deadlines, subtasks, colors, and attachments
- Backup export/import as JSON
- Optional task API plugin for creating and reading tasks
- Optional Google Calendar sync

## Requirements

- Node.js and npm
- Firebase project, only for hosted Firebase mode
- Netlify account, only if you want to deploy API functions with Netlify

## Quick Start: Local Mode

Run SevenFlow without Firebase and without Netlify:

```bash
npm install
npm run start:local
```

Then open `http://127.0.0.1:8000/login.html`.

Default local credentials:

- Email: `admin@sevenflow.local`
- Password: `sevenflow`

Local data is stored in `.sevenflow-data/data.json`. Change the credentials with environment variables before exposing the server to another device or network.

## Hosted Firebase Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment example:

```bash
cp .env.example .env
```

3. Fill in your Firebase and optional integration values in `.env`.

4. Generate the runtime Firebase config:

```bash
npm run build
```

5. Start a local static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

This static mode is enough for the app UI, Firebase login, and Firebase sync. API routes such as `/api/tasks/create` need the bundled `task-api` plugin plus either Netlify Functions or the self-hosted Node server below.

## Self-Hosting Without Netlify

SevenFlow can run on Linux, macOS, or Windows with Node.js.

For the Firebase-backed app plus local API routes:

```bash
npm install
npm start
```

The server:

- generates `js/firebase-config.js` from `.env`
- serves the static app
- exposes plugin API routes under `/api/...` when the related plugin is enabled

Open `http://localhost:8000` or set another port:

```bash
PORT=3000 npm start
```

For a small private server, put this Node process behind a reverse proxy such as Caddy, nginx, Apache, or a hosting panel that can forward HTTPS traffic to the Node port.

For the Firebase-free JSON-backed mode:

```bash
npm run start:local
```

Set these variables to choose your own local login:

- `SEVENFLOW_LOCAL_USER_EMAIL`
- `SEVENFLOW_LOCAL_USER_PASSWORD`
- `SEVENFLOW_LOCAL_USER_ID`
- `SEVENFLOW_LOCAL_SESSION_SECRET`

## Firebase

SevenFlow stores data under the signed-in user:

- `users/{uid}/tasks/{YYYY-MM-DD}`
- `users/{uid}/backlogs/data`
- `users/{uid}/backlogs/titles`
- `users/{uid}/settings/preferences`

Deploy the included Firestore and Storage rules to your Firebase project before using the app with real users.

## Optional API Plugin

The API is provided by the `task-api` plugin. It allows users to create and read tasks via an API key generated in the app settings. It works either through Netlify Functions or through the self-hosted Node server.

Required environment variables for API functions:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `TASK_API_ENCRYPTION_SECRET`
- `SEVENFLOW_API_BASE_URL`
- `SEVENFLOW_PLUGINS=task-api`

Leave `SEVENFLOW_API_BASE_URL` empty when the API runs on the same domain as the app.

## Backend Modes

SevenFlow currently has two backend modes:

Hosted Firebase mode:

- Authentication: Firebase Auth
- Database: Firestore
- Files: Firebase Storage
- API admin access: Firebase Admin SDK

Local JSON mode:

- Authentication: local Node server session
- Database: `.sevenflow-data/data.json`
- Files: local mode does not aim to replace production file storage yet
- API: disabled in the UI for local mode while the hosted API remains available for Firebase mode

## Future Backend Direction

To make SevenFlow production-ready without Firebase, the next step should be a storage/auth adapter boundary rather than a second database bolted onto the current code. A good target would be:

- `firebase` adapter for the current hosted version
- `self-hosted` adapter with server-side auth, SQLite or Postgres, and local/S3-compatible file storage
- one shared client contract for tasks, settings, backlogs, inbox, recurring tasks, and attachments

That would let people run SevenFlow on their own Linux server, Mac, Windows machine, Docker host, or NAS without requiring Firebase.

## Plugins

SevenFlow keeps optional integrations outside the core app. Enable bundled plugins with:

```bash
SEVENFLOW_PLUGINS=task-api,google-login,google-calendar
```

Bundled plugins:

- `task-api`: adds API key management in settings and enables task API routes
- `google-login`: adds Google sign-in/register buttons to the login page
- `google-calendar`: adds Google Calendar settings and calendar-to-task sync

## Optional Google Calendar

Google Calendar sync is provided by the `google-calendar` plugin. It uses a Google OAuth Web Client ID with read-only calendar access.

Required environment variable:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `SEVENFLOW_PLUGINS=google-calendar`

## Optional Google Login

Google Login is provided by the `google-login` plugin.

Required environment variable:

- `SEVENFLOW_PLUGINS=google-login`

For public production use, Google may require OAuth app verification.

## Plugin Direction

SevenFlow is a good candidate for internal plugin-style modules. A pragmatic first step is to move integrations such as Google Calendar into isolated modules with a small app-facing contract:

```js
registerIntegration({
  id: 'google-calendar',
  init(app) {},
  renderSettings(app) {},
  sync(app) {}
});
```

Loading untrusted third-party plugins directly in the browser is not recommended until the security model is explicit.

## Checks

Run the JavaScript syntax check:

```bash
npm run check:js
```

Run the Firestore rules and API helper tests:

```bash
npm run test:rules
```

## Publishing

See `docs/publishing.md` before publishing SevenFlow to a public GitHub repository.

## License

MIT
