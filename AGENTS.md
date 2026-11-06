# Repository guidance

## Development workflow

- Use Node.js 22 and pnpm 11.19.0.
- Run `pnpm hooks:install` once per checkout to enable the local pre-commit hook.
- The pre-commit hook checks staged whitespace and runs `pnpm exec oxlint`.
- Run `pnpm verify` before opening a pull request. It runs tests, application type checking, and the Railway production build.
- Pull requests are verified by GitHub Actions. Merging to `main` automatically deploys the verified commit to Railway production.
- Keep `RAILWAY_TOKEN` in GitHub Actions secrets; never commit credentials or connection strings.

## Branching

- Never create branches that start with `cursor/`.
- Name every branch with `feature/`, `bug/`, or `experiment/`, then a lowercase kebab-case slug.
- Examples: `feature/offline-retry`, `bug/session-cookie`, `experiment/paper-redesign`.

## Pull requests

- Keep every PR description concise and easy to understand.
- State what changed and why in one or two short sentences; avoid fluff and process narration.

## Deployment

- The production URL is `https://os.kashyab.xyz`.
- Prefer the pull-request-to-`main` workflow for normal releases.
- Use `pnpm deploy:railway` only for an explicit local emergency/manual deployment. It refuses dirty worktrees and reruns verification.

## Cloud Agent local stack

Cloud Agents boot with a local throwaway Postgres and the Railway Node server on port 4173.

- `DATABASE_URL` points at `127.0.0.1` only. Never point agents at production Railway Postgres.
- Local sign-in: account `dev-owner`, password `dev-owner-local-only` (also in `~/.chalkbook-dev/dev-owner-password.txt`).
- Day-to-day checks: `pnpm verify`. App URL while the environment `start` script is running: `http://127.0.0.1:4173`.
- Do not use `RAILWAY_TOKEN` or production credentials for ordinary agent work.

## Change safety

- Preserve the existing offline queue, authenticated owner scoping, and database migration conventions.
- Do not seed real workout data or expose database credentials to browser code.
- Check `git status` before committing so unrelated user changes remain untouched.
