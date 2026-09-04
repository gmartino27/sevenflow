<p align="center">
  <img src="assets/branding/sevenflow-logo-horizontal.png" alt="SevenFlow" width="420">
</p>

<p align="center">
  <strong>A calm, open-source weekly planner for people who want to see their work instead of managing a database of tasks.</strong>
</p>

<p align="center">
  <a href="#why-sevenflow">Why</a> |
  <a href="#features">Features</a> |
  <a href="#quick-start-local-mode">Quick start</a> |
  <a href="#self-hosting">Self-hosting</a> |
  <a href="#plugins">Plugins</a>
</p>

<p align="center">
  <img src="docs/screenshots/sevenflow-week-5-day.svg" alt="SevenFlow 5 day weekly planning view" width="900">
</p>

# SevenFlow

SevenFlow is an open-source task planning app built around a simple idea: your week should be visible, lightweight, and easy to adjust.

It is designed for people who like weekly planning tools such as [Tweek](https://tweek.so/), TeuxDeux, Sunsama-style day planning, or paper planners, but want something self-hostable, hackable, and focused on fast task capture instead of project-management ceremony.

SevenFlow supports two operating modes:

- Hosted mode with Firebase and optional Netlify Functions.
- Local self-hosted mode with the bundled Node server and JSON file storage.

The original hosted Firebase/Netlify setup remains supported. The local mode is intended for people who want to run SevenFlow on their own computer or server without creating Firebase or Netlify accounts.

## Why SevenFlow

SevenFlow was built because many task apps become too heavy for everyday planning. They are powerful, but they often force you to think in projects, statuses, priorities, databases, and dashboards before you have even decided what you want to do today.

SevenFlow takes the opposite approach:

- Plan visually across a few days instead of hiding everything in lists.
- Capture unscheduled tasks in an inbox without polluting the week.
- Keep recurring tasks simple and predictable.
- Move work between today, tomorrow, backlog, and inbox quickly.
- Keep the core app small, with optional integrations handled through plugins.

It is not trying to replace a full project-management suite. It is meant to be the place where your week becomes clear.

## App Preview

### 5 Day View

<p align="center">
  <img src="docs/screenshots/sevenflow-week-5-day.svg" alt="SevenFlow 5 day weekly planning view" width="900">
</p>

### 3 Day Focused View

<p align="center">
  <img src="docs/screenshots/sevenflow-week-3-day.svg" alt="SevenFlow 3 day focused planning view" width="720">
</p>

## Features

- Weekly task planning with desktop 3, 5, or 7 day views.
- Mobile-friendly 1, 3, or 5 day views.
- Inbox for tasks that are not scheduled yet.
- Three backlog columns for flexible planning beyond the visible week.
- Optional notepad area instead of backlog columns.
- Recurring tasks, including daily, weekly, monthly, yearly, and biweekly tasks.
- Reminders, tags, deadlines, colors, subtasks, and attachments.
- Drag and drop sorting across days, backlog, and inbox.
- Quick actions for moving tasks to today, tomorrow, inbox, or backlog.
- Search by title and task content.
- Backup export/import as JSON.
- Optional task API plugin for creating and reading tasks.
- Optional Google Calendar sync plugin.
- Optional Google Login plugin.

## Quick Start: Local Mode

Run SevenFlow without Firebase and without Netlify:

```bash
npm install
npm run start:local
```

Then open:

```text
http://127.0.0.1:8000/login.html
```

Default local credentials:

```text
Email: admin@sevenflow.local
Password: sevenflow
```

Local data is stored in:

```text
.sevenflow-data/data.json
```

Change the credentials with environment variables before exposing the server to another device or network.

## Hosted Firebase Setup

Install dependencies:

```bash
npm install
```

Copy the environment example:

```bash
cp .env.example .env
```

Fill in your Firebase and optional integration values in `.env`, then generate the runtime Firebase config:

```bash
npm run build
```

Start a local static server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

This static mode is enough for the app UI, Firebase login, and Firebase sync. API routes such as `/api/tasks/create` need the bundled `task-api` plugin plus either Netlify Functions or the self-hosted Node server.

## Self-Hosting

SevenFlow can run on Linux, macOS, or Windows with Node.js.

For the Firebase-backed app plus local API routes:

```bash
npm install
npm start
```

The server:

- Generates `js/firebase-config.js` from `.env`.
- Serves the static app.
- Exposes plugin API routes under `/api/...` when the related plugin is enabled.

Open:

```text
http://localhost:8000
```

Or set another port:

```bash
PORT=3000 npm start
```

For a small private server, put this Node process behind a reverse proxy such as Caddy, nginx, Apache, or a hosting panel that can forward HTTPS traffic to the Node port.

For the Firebase-free JSON-backed mode:

```bash
npm run start:local
```

Useful local mode variables:

- `SEVENFLOW_LOCAL_USER_EMAIL`
- `SEVENFLOW_LOCAL_USER_PASSWORD`
- `SEVENFLOW_LOCAL_USER_ID`
- `SEVENFLOW_LOCAL_SESSION_SECRET`

## Firebase Data Model

SevenFlow stores data under the signed-in user:

- `users/{uid}/tasks/{YYYY-MM-DD}`
- `users/{uid}/backlogs/data`
- `users/{uid}/backlogs/titles`
- `users/{uid}/settings/preferences`

Deploy the included Firestore and Storage rules before using the app with real users.

## Plugins

SevenFlow keeps optional integrations outside the core app. Enable bundled plugins with:

```bash
SEVENFLOW_PLUGINS=task-api,google-login,google-calendar
```

Bundled plugins:

- `task-api`: Adds API key management in settings and enables task API routes.
- `google-login`: Adds Google sign-in/register buttons to the login page.
- `google-calendar`: Adds Google Calendar settings and calendar-to-task sync.

### Task API Plugin

Required environment variables:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `TASK_API_ENCRYPTION_SECRET`
- `SEVENFLOW_API_BASE_URL`
- `SEVENFLOW_PLUGINS=task-api`

Leave `SEVENFLOW_API_BASE_URL` empty when the API runs on the same domain as the app.

### Google Calendar Plugin

Required environment variables:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `SEVENFLOW_PLUGINS=google-calendar`

Google Calendar sync uses a Google OAuth Web Client ID with read-only calendar access. For public production use, Google may require OAuth app verification.

### Google Login Plugin

Required environment variable:

- `SEVENFLOW_PLUGINS=google-login`

## Backend Modes

Hosted Firebase mode:

- Authentication: Firebase Auth.
- Database: Firestore.
- Files: Firebase Storage.
- API admin access: Firebase Admin SDK.

Local JSON mode:

- Authentication: Local Node server session.
- Database: `.sevenflow-data/data.json`.
- Files: Local mode does not aim to replace production file storage yet.
- API: Disabled in the UI for local mode while the hosted API remains available for Firebase mode.

## Future Direction

SevenFlow is moving toward a clearer adapter and plugin architecture:

- `firebase` adapter for the current hosted version.
- `self-hosted` adapter with server-side auth, SQLite or Postgres, and local/S3-compatible file storage.
- One shared client contract for tasks, settings, backlogs, inbox, recurring tasks, and attachments.
- Optional integrations distributed as plugins instead of being hardwired into the core app.

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

## Documentation

- `docs/self-hosting.md`: Self-hosting notes.
- `docs/backend-adapters.md`: Backend adapter direction.
- `docs/publishing.md`: Public GitHub publishing checklist.

## License

MIT

## Trademark Note

SevenFlow is not affiliated with Tweek, TeuxDeux, Sunsama, or any other planning product mentioned here. Product names are used only to describe the category of weekly planning tools.
