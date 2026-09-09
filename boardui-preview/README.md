# Gym Notebook BoardUI preview

An isolated local visual trial using official free BoardUI source components. Run `pnpm dev` in this directory and open http://127.0.0.1:5188. `pnpm build` builds the static preview; `pnpm check` checks TypeScript.

Today, History, Body Weight, and Program use a snapshot of Gym Notebook's program with clearly labeled sample values. Set edits, completion, body-weight entries, theme switching, and reset work in memory. Reloading resets all sample data. No API, authentication, database, or service worker is connected. The parent app is unchanged by this preview.

BoardUI foundations and components were installed from https://www.boardui.com using its official CLI. Components retain their original source. The preview is local and has not been deployed.

Body Weight now includes 7/30/90-day charts, recorded weigh-ins and seven-calendar-day averages, kg/lb conversion, period statistics, and a matching Today sparkline. Sample history covers June–September 2026. Check calculation boundaries with `node --experimental-strip-types weight-data.test.ts`.

Workout preview supports extra sets copied from the preceding set, undo, 90-second rest timers, partial finish/resume, and dynamic set counts. Typography is enlarged with higher-contrast semantic text colors. The UI uses compact labels and a single workout column.
