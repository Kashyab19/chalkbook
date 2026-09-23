# Chalkbook

A private mobile workout and body-weight PWA. The default Legs, Push, Pull, Upper, Lower, and weekend rest program is preserved. No lifting weights are seeded.

Live address: https://os.kashyab.xyz

## Current implementation

- Four sections: Today, History, Body Weight, Program.
- IndexedDB commits each set edit and its synchronization operation atomically. The status only claims device persistence after the transaction completes.
- Online, foreground, initial-open, and periodic foreground retry. No dependency on background sync.
- Stable operation IDs with transactional server receipts prevent repeated writes after response loss.
- Stale server snapshots are discarded if local state changed while the request was in flight.
- Account identifiers select separate IndexedDB databases. A page captures its account identifier once; another tab changing accounts cannot redirect that page's queued operations.
- Production app-shell precaching, standalone manifest, iPhone icons, safe areas, and keyboard-aware bottom navigation.
- A waiting service worker never interrupts a logging screen. It activates after all old clients close. Updates never clear IndexedDB.
- JSON backup export and validated merge restoration, including unsynced records. Restore replaces matching records and the program, retaining records missing from the backup.

## Architecture

The original Sites source and D1 migrations are retained for continuity. The independent Railway target reuses the React UI but serves a Vite-built app shell from a small Node HTTP server with PostgreSQL. It does not require ChatGPT Sites, Cloudflare Workers, or the beta Vinext runtime in production.

`components/gym/` holds the screens and shared numeric controls. `lib/training.ts` owns the program and training calculations. `lib/operations.ts` contains shared validation and the deterministic local reducer. `lib/notebook-store.ts` owns IndexedDB transactions; `hooks/use-notebook.ts` owns synchronization. `server/` implements the independently hosted API and private authentication.

PostgreSQL tables live in the dedicated `identity` and `fitness` schemas, with migration bookkeeping in `infrastructure`. Naming and migration conventions are documented in [db/README.md](db/README.md). Every training record and operation receipt is scoped to an authenticated owner. Owner-scoped transactions serialize writes; duplicate operation IDs are no-ops. The server rejects a queue whose `X-Notebook-Owner` differs from the signed-in account. There is no public registration endpoint.

The current intended audience is one owner. Additional accounts can be provisioned explicitly later; no invitation, sharing, social, or permissions UI has been added.

## Conflict policy

The last successfully committed operation received by the server wins for the same set, body-weight date, or entire program. Different sets remain independent. Deleting a session removes it; a subsequent stale set edit is acknowledged without recreating it. Only starting that date/template again or explicitly restoring a backup recreates a session. Body entries use their calendar date as a stable ID and sessions retain their original IDs.

Local pending operations remain visible until acknowledged. Server refreshes cannot replace newer local state. Receipts are retained indefinitely so even delayed retries remain idempotent.

## Railway deployment

1. Confirm the existing Railway project and Postgres service. Keep its connection private to the app service.
2. Set `DATABASE_URL` using the restricted application role and the private Railway database hostname and `APP_ORIGIN=https://os.kashyab.xyz` on the app service. Do not expose either database credentials or connection strings to browser code.
3. Run `node scripts/postgres-admin.mjs migrate` against that exact database. It creates only namespaced identity and fitness tables.
4. Provision the single private owner account with `node scripts/postgres-admin.mjs create-user <account-name> <private-password-file>`. This is an operator command, not public registration.
5. Export the original Sites data while signed in. Run `node scripts/postgres-admin.mjs import <account-name> <backup-file>` into an empty target. Verify the complete program and all records before switching addresses. Existing Sites data is never deleted by this migration.
6. Deploy the included Dockerfile. The server listens on Railway's `PORT`, and `/api/health` checks database readiness.
7. Add `os.kashyab.xyz` to the Railway app service and apply its returned DNS records in the correct Cloudflare account. Verify HTTPS and authenticated API access before installing.

The database, user provisioning, and migration must be finished before the health check can pass. Use a strong generated owner password. Authentication uses salted scrypt password hashes, opaque server-side sessions, HttpOnly cookies, strict same-site cookies, origin checks, and account login throttling.

The existing Sites app and independent app are different origins. Sync or export the old app before the cutover. Safari and an installed iPhone web app may also have separate local storage, so open the installed app online once before relying on it offline.

## Development and checks

The recommended development-to-production path is:

1. Run `pnpm dev` while building.
2. Run `pnpm verify` before committing. It runs tests, application typecheck, and the production build.
3. Push the branch and open a pull request. GitHub runs `pnpm verify` automatically.
4. Merge the pull request. A push to `main` reruns verification and deploys the exact verified commit to production automatically.

For one-time setup, add a repository secret named `RAILWAY_TOKEN` and create a GitHub Environment named `production`. Protect that environment if production deploys should require approval. The existing `pnpm deploy:railway` command remains available for a local emergency/manual deploy.

### Local commit checks

Install the lightweight pre-commit hook once with `pnpm hooks:install`. It checks staged whitespace errors and runs the linter. The full test, typecheck, and production build remain in the pull-request workflow.

- `pnpm test`: training, validation, unit conversion, backup, and reducer tests.
- `pnpm exec tsc --project tsconfig.application.json --noEmit`: application type checking.
- `pnpm build:railway`: independent frontend, Node API, and versioned service worker.
- `pnpm start:railway`: run the built server with `DATABASE_URL` configured.
- `pnpm dev`: retained Sites development preview.
- `pnpm build`: retained Sites build with offline shell generation.

`tests/browser.mjs` exercises the browser UI against an isolated local database, including a full browser shutdown/relaunch offline. `tests/update.mjs` verifies the waiting-worker lifecycle and offline persistence across an update. Test fixture values are never written to the user's live database.

## iPhone installation and device checklist

1. Open the final HTTPS URL in Safari and sign in.
2. Share > Add to Home Screen; enable Open as Web App if shown, then Add.
3. Open the home-screen app online and wait for Synced and Ready offline.
4. Enable airplane mode, change a test set and log body weight, then close the app completely.
5. Reopen offline and verify the changes. Reconnect and wait for Synced, then reopen to confirm them.
6. Check keyboard placement, bottom safe area, touch controls, and focus advancing after completing a set.
7. Export a backup and confirm it appears in Files. When an update is available, keep an unsynced test edit, close all app windows, reopen, and verify it remains.

Desktop phone-sized testing is a simulation, not an actual iPhone installation test. iOS can remove website storage under storage pressure or when the user clears website data. Periodic exports and successful server synchronization remain necessary backups.
