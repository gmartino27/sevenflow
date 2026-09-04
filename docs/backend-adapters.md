# Backend Adapter Direction

SevenFlow keeps the current Firebase setup working, but the open-source version must not make Firebase the only possible backend.

## Current State

SevenFlow currently supports:

- hosted Firebase mode
- local JSON mode through the bundled Node server

In hosted mode, the browser app talks directly to Firebase:

- Firebase Auth for login
- Firestore for task, backlog, inbox, and settings data
- Firebase Storage for attachments
- Firebase Admin SDK in API routes

This is practical and reliable for the original hosted app.

In local JSON mode, the app uses:

- local Node login
- `.sevenflow-data/data.json`
- browser-to-server requests through `LocalTaskManager`

## Plugin Boundary

Optional integrations should live outside the core app and register themselves through `SevenFlowPlugins`.

Current bundled plugins:

- `task-api`
- `google-login`
- `google-calendar`

The core app should expose hooks for auth providers, settings panels, settings persistence, task source icons, backup setting preparation, and lifecycle events. Plugins may use Firebase when the Firebase backend mode is active, but the core should not contain Google-specific login/calendar UI or task API settings UI.

## Target Shape

Introduce a backend adapter contract around the data operations the app needs:

```js
const backend = {
  auth: {
    getCurrentUser() {},
    signIn() {},
    signOut() {}
  },
  tasks: {
    watchRange(startDate, endDate, callback) {},
    saveDay(dateKey, tasks) {},
    moveTask(taskId, target) {},
    search(query) {}
  },
  backlogs: {
    watch(callback) {},
    save(backlogs) {}
  },
  settings: {
    load() {},
    save(settings) {}
  },
  files: {
    upload(file) {},
    getDownloadUrl(path) {},
    remove(path) {}
  }
};
```

## First Adapters

- `firebase`: current production backend
- `node-sqlite`: self-hosted single-user or small-team backend
- `node-postgres`: self-hosted multi-user backend

## Why Not Replace Firebase Immediately?

Firebase is woven into the app at several layers. Replacing it in one pass would risk regressions in recurring tasks, inbox sync, attachments, reminders, and API auth. The safer path is:

1. Keep the Firebase adapter stable.
2. Move Firebase-specific calls behind a contract.
3. Add a self-hosted adapter.
4. Add a migration/export path between adapters.
