# SevenFlow Plugins

SevenFlow keeps optional integrations outside the core app. The core planner can run without Google, without the task API, without voice input, and without extra recurring-task controls.

Enable bundled plugins with the `SEVENFLOW_PLUGINS` environment variable:

```bash
SEVENFLOW_PLUGINS=ramble,pause-recurring,task-api,google-login,google-calendar
```

Use only the plugins you need. For example:

```bash
SEVENFLOW_PLUGINS=ramble,pause-recurring
```

## Bundled Plugins

### Ramble

Plugin id: `ramble`

Adds voice/text task capture and local task parsing. Ramble does not require a SevenFlow server API or external API key.

How it works:

- Web: uses browser speech recognition when available (`SpeechRecognition` or `webkitSpeechRecognition`).
- Android app: can use the native `AndroidSpeech` bridge.
- Parsing: runs locally in the frontend through the SevenFlow task parser.

Requirements:

- `SEVENFLOW_PLUGINS=ramble`
- A browser or WebView with speech recognition support for voice recording.
- HTTPS in production for microphone access in most browsers. `localhost` is usually accepted for local testing.

Limitations:

- Browser support varies. Chrome and Edge are the safest web targets.
- Firefox and Safari may not support the same speech-recognition APIs.
- Manual text input in the Ramble modal works even when voice recognition is unavailable.

### Pause Recurring

Plugin id: `pause-recurring`

Adds controls for temporarily hiding a recurring task series without deleting it.

What it enables:

- Header button for viewing paused recurring series.
- Mobile menu entry for paused recurring series.
- Modal and context-menu action for pausing a recurring series.
- Resume action inside the paused tasks modal.

Requirements:

- `SEVENFLOW_PLUGINS=pause-recurring`

The plugin stores paused series in the normal SevenFlow settings data under `pausedRecurring`.

### Task API

Plugin id: `task-api`

Adds API key management in settings and enables task API routes for creating and reading tasks.

Required environment variables:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `TASK_API_ENCRYPTION_SECRET`
- `SEVENFLOW_API_BASE_URL`
- `SEVENFLOW_PLUGINS=task-api`

Leave `SEVENFLOW_API_BASE_URL` empty when the API runs on the same domain as the app.

### Google Login

Plugin id: `google-login`

Adds Google sign-in/register buttons to the login page.

Required environment variable:

- `SEVENFLOW_PLUGINS=google-login`

For public production use, Google may require OAuth app verification.

### Google Calendar

Plugin id: `google-calendar`

Adds Google Calendar settings and calendar-to-task sync.

Required environment variables:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `SEVENFLOW_PLUGINS=google-calendar`

Google Calendar sync uses a Google OAuth Web Client ID with read-only calendar access. For public production use, Google may require OAuth app verification.

## Local JSON Mode

The local JSON mode does not enable plugins by default. You can still enable frontend-only plugins such as Ramble or Pause Recurring:

```bash
SEVENFLOW_PLUGINS=ramble,pause-recurring npm run start:local
```

The `task-api` plugin is intended for Firebase-backed installations because it relies on Firebase Admin access.

## Docker

The default Docker Compose setup starts without optional plugins. To enable frontend-only plugins in Docker, edit `docker-compose.yml`:

```yaml
environment:
  SEVENFLOW_PLUGINS: ramble,pause-recurring
```

For multiple plugins, use a comma-separated list:

```yaml
environment:
  SEVENFLOW_PLUGINS: ramble,pause-recurring,task-api,google-calendar
```
