# Publishing SevenFlow Publicly

Use a fresh empty GitHub repository for the public release. Do not make the old private repository public, because local and remote branches may still contain historical development commits that are not part of the clean public history.

## Public Branch

The public-ready branch is:

```bash
codex/open-source-prep
```

It intentionally has a short, clean history.

## Safe Push

After creating an empty GitHub repository, add its URL as a new remote, then push only the public branch as `main`:

```bash
git remote add public git@github.com:YOUR_ACCOUNT/sevenflow.git
git push public codex/open-source-prep:main
```

Do not run:

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

Expected public history length for the initial release is small. At the time this document was written it was 3 commits.

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
