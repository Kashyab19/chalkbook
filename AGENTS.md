# Repository guidance

## Development workflow

- Use Node.js 22 and pnpm 11.19.0.
- Run `pnpm hooks:install` once per checkout to enable the local pre-commit hook.
- The pre-commit hook checks staged whitespace and runs `pnpm exec oxlint`.
- Run `pnpm verify` before opening a pull request. It runs tests, application type checking, and the Railway production build.
- Pull requests are verified by GitHub Actions. Merging to `main` automatically deploys the verified commit to Railway production.
- Keep `RAILWAY_TOKEN` in GitHub Actions secrets; never commit credentials or connection strings.

## Deployment

- The production URL is `https://os.kashyab.xyz`.
- Prefer the pull-request-to-`main` workflow for normal releases.
- Use `pnpm deploy:railway` only for an explicit local emergency/manual deployment. It refuses dirty worktrees and reruns verification.

## Change safety

- Preserve the existing offline queue, authenticated owner scoping, and database migration conventions.
- Do not seed real workout data or expose database credentials to browser code.
- Check `git status` before committing so unrelated user changes remain untouched.
