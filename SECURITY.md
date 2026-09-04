# Security Policy

## Reporting Security Issues

Please do not open public issues for sensitive security reports.

Report vulnerabilities privately to the project maintainer.

## Secrets

Never commit Firebase service account JSON, API keys, OAuth secrets, or generated runtime config files.

The following files are intentionally ignored:

- `.env`
- `js/firebase-config.js`
- Firebase debug logs

If a secret was ever committed to a public repository, rotate it immediately in the provider dashboard.

## Publishing Publicly

Before making an existing private repository public, scan both the current files and the Git history.

If secrets ever appeared in history, prefer publishing a fresh clean repository snapshot instead of pushing the old private history. After publishing, rotate any credentials that may have been exposed in commits, build logs, or local config files.
