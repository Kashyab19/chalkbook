# Deployment and validation

Deployment date: 2026-09-07. Live application: https://os.kashyab.xyz.

## Deployment

- Railway service `personal-os-web`, PostgreSQL over its private hostname, and a restricted runtime database role.
- Cloudflare DNS-only CNAME for `os` plus Railway's ownership TXT record. Existing apex and email records were preserved.
- Railway deployment `27d72c87-764c-49b6-a11d-1708fce7fd9a` passed its database health check.
- Valid HTTPS certificate, HSTS, same-origin API checks, private API responses with `Cache-Control: no-store`, and Secure/HttpOnly/SameSite cookies verified.
- The migrated program and records were compared for full JSON equality through the deployed authenticated API. The original Sites database was retained.
- Only one owner account was provisioned. Initial credentials are in the ignored, private local file `outputs/owner-sign-in.txt`.

## Automated checks

The complete workflow ran in a desktop Chromium browser at phone widths 320, 390, and 430 pixels, against an isolated PostgreSQL test database. This was not an iPhone test.

- Online program loading, manifest, service-worker installation, and no horizontal scrolling or visible em dashes.
- Offline weight/reps changes, completion focus, body-weight logging, and program edits committed to IndexedDB.
- Full browser shutdown and offline reopening preserved the snapshot and pending operations.
- Reconnection, idempotent retries, refresh persistence, and acknowledged old-operation replay without overwriting newer data.
- Later-workout prefill and kg/lb conversion.
- Backup export, deletion, restoration, repeated restoration without duplicates, and offline deletions.
- Waiting service-worker update without reloading an active screen; activation after closure with unsynced edits intact.
- Anonymous API access, foreign origins, mismatched device-owner headers, and revoked sessions rejected without changing data.
- Five training/validation/reducer unit tests; application TypeScript check; lint on the changed application sources; independent production build.

The deployed HTTPS shell was separately checked in a phone-sized browser and reloaded offline. The local resolver retained an earlier negative DNS response, so that check mapped the hostname to the IP returned by public DNS. TLS hostname and certificate verification remained enabled. Normal resolver propagation may still take time.

The repository-wide lint command also reports pre-existing findings in unused `components/ui` and the legacy `use-webmcp` hook. The separate `boardui-preview` project has unrelated TypeScript import errors under the root wildcard configuration. `tsconfig.application.json` scopes type checking to this application; those preview files were not edited.

## On-device acceptance

1. Open https://os.kashyab.xyz in Safari online and sign in.
2. Share > Add to Home Screen > Add, with Open as Web App enabled if offered.
3. Launch from the home screen online and wait for Synced and Ready offline.
4. Turn on airplane mode, log real set/body-weight changes, fully close, and reopen offline. Confirm they remain.
5. Reconnect and confirm Synced, then refresh/reopen and check the same entries.
6. Check keyboard visibility, the home-indicator safe area, one-handed controls, and next-set focus.
7. Export to Files. At the next app update, verify an unsynced edit survives closing and reopening.

## Remaining operational limits

- Device storage can be cleared by the user or operating system. Successful synchronization and periodic exports remain the backup path.
- Same-field conflicts use last server-committed operation wins; program edits are a whole-program conflict unit.
- Sync needs an open/foreground app; it does not depend on iPhone background sync.
- A task-created empty D1 database remains in the initially selected, incorrect Cloudflare account. No workout data was copied there, and it is not used by this deployment.

## BoardUI update, 2026-09-08

- Integrated the separate BoardUI design with the authenticated app and existing offline queue. The sample preview is excluded from the deployment image.
- Added body-weight chart ranges and seven-day averages, weight editing, extra workout sets, finish/resume, rest timer, and saved device drafts.
- Reduced body and input typography to 16px and checked the workout and body-weight screens at a 320px viewport without horizontal overflow. Weight entry saving updated the chart and entries in an isolated local test server.
- Application TypeScript check, six unit tests (including extra-set replay and backup validation), and Railway production build passed.
- Uploaded Railway deployment `069c1825-280d-4f73-8c44-c287c2870d30`. Deployment status SUCCESS verified. Public /api/health returned ok; the served JavaScript contains the new workout and chart UI, and /sw.js serves offline shell e7b7bfb57bd4ef86.
