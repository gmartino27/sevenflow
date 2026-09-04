# Publishing SevenFlow Publicly

This repository is intended to be published from a clean `main` branch with a fresh public history. Do not replace it with the old private development repository, because old local or remote branches may contain historical experiments, provider-specific setup, or obsolete integration code.

## Safe Push

After creating an empty GitHub repository, add its URL and push only `main`:

```bash
git remote add origin git@github.com:YOUR_ACCOUNT/sevenflow.git
git push -u origin main
```

Do not run these commands against the old private repository:

```bash
git push --all
git push --tags
```

## Before Pushing

Run:

```bash
npm run check:js
npm run test:rules
git status --short
git log --oneline HEAD
git rev-list --count HEAD
```

The initial public repository should have a very small history. A one-commit initial public release is preferred.

## Ignored Local Files

These files and folders are intentionally not public:

- `.env`
- `.firebaserc`
- `.sevenflow-data/`
- `js/firebase-config.js`
- `node_modules/`
- editor folders such as `.idea/` and `.vscode/`
- Firebase debug logs

## Firebase Rules

Firestore and Storage rules are part of the public project setup and should be committed:

- `firestore.rules`
- `storage.rules`
