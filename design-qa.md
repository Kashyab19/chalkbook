# Design QA — Repwise responsive refinement

- Source visual truth: `/Users/nikash/.codex/generated_images/01a0bf8e-eabe-7be1-bb07-14bf4deeb4cd/exec-2d90fd56-ca86-43e6-b0fa-70263d8d9347.png`
- Implementation: `http://localhost:3000/`, in-app browser tab 2, active Push workout on 2026-09-15
- Implementation screenshot: in-app browser captures emitted in the build thread for Today, History, Program, and Settings (the browser surface does not expose a filesystem save path)
- Viewport: 375 × 667 iPhone SE-class mobile browser viewport plus the default desktop viewport; implementation content is responsive and unframed
- Source pixels: 853 × 1844 (roughly 2× mobile density)
- Implementation pixels: 375 × 667 browser capture at device scale 1
- Density normalization: compared by matching the app-owned mobile content width and proportions; browser/device chrome is absent from both
- State: active workout, current exercise Chest Press, set 1 of 3, empty weight and reps, 0 of 21 total sets

## Full-view comparison evidence

The implementation preserves the source hierarchy: compact session title/progress header, large freestanding 3D exercise subject, oversized exercise name and set count, previous-performance pill, two side-by-side steppers, dominant lime log action, rest feedback, and a single upcoming exercise. The app's real workout data replaces the mock's illustrative content, so Chest Press / 21 sets is intentional rather than drift.

## Focused region comparison evidence

- Header: title, date, progress number, progress track, and compact overflow action match the source structure and visual weight.
- Exercise hero: the former blue-tile illustration was replaced with a transparent, dark-equipment 3D asset matching the selected preview's character proportions and materials.
- Entry controls: weight and reps use large numeric inputs with 40–46px decrement/increment targets and the same dark inset treatment as the source.
- Primary action: the log control spans the content width, uses the source lime accent, and contains a high-contrast circular arrow target.
- Rest transition: successfully logging a set advances to the next set, starts a 90-second timer, and exposes undo/note actions; undo was tested and the temporary test values were cleared.

## Required fidelity surfaces

- Fonts and typography: passed. The system sans differs slightly from the mock's exact display face, but size, weight, hierarchy, tracking, and wrapping closely match. This is a P3 refinement, not a usability or fidelity blocker.
- Spacing and layout rhythm: passed. Major region proportions and vertical sequence match; responsive controls remain fully reachable at the tested mobile width.
- Colors and visual tokens: passed. Near-black canvas, warm white foreground, gray secondary text, dark tactile surfaces, and electric-lime action/progress are aligned with the source.
- Image quality and asset fidelity: passed after iteration. Eleven transparent high-resolution v2 exercise assets now replace the pale-blue tiles and share the preview's premium toy-like 3D art direction.
- Copy and content: passed. App-specific names, dates, units, totals, and progression text come from live session data rather than hard-coded mock content.

## Comparison history

### Iteration 1

- [P1] Exercise art used the older pastel-blue tile style instead of the source's freestanding dark-equipment 3D figures.
- Fix: generated and wired a new transparent v2 exercise-art set for bench press, squat, deadlift, overhead press, pulldown, row, leg press, bicep curl, tricep pushdown, lunge, lateral raise, and plank/core mappings.
- Post-fix evidence: the refreshed Push workout shows the bench/chest-press character isolated on the black canvas with correct dark weights, white top, black shorts, and soft studio rendering.

### Iteration 2

- [P2] Existing app chrome consumed the upper portion of the mobile screen and pushed the current set below the fold.
- Fix: hide the global header and redundant date heading during focus mode while retaining compact, persistent section navigation.
- Post-fix evidence: the refreshed mobile capture begins directly with session title/progress, keeps the hero exercise and set context above the fold, and preserves navigation at the bottom edge.

### Iteration 3

- [P1] Reloading on the scheduled rest day returned to the legacy app shell, making the redesign appear absent.
- Fix: replaced the rest-day fallback with a full focus-mode recovery screen, preview-style 3D art, and direct optional-workout choices.
- Post-fix evidence: the refreshed localhost default now visibly opens on the black-and-lime “Rest day / Take the win” screen with the 3D plank character and the same navigation system used elsewhere.

### Iteration 4

- [P1] The redesigned Today surface and the legacy History, Weight, and Program surfaces used conflicting shells, and the Program week selector could overflow on mobile.
- Fix: introduced one dark token system, responsive icon navigation, consistent cards and controls, horizontal-snap day selection, mobile wrapping rules, and top-of-page restoration when changing sections.
- Post-fix evidence: Today, History, Weight, and Program were checked at a 390 × 844 viewport; each reported a 390px document width with no horizontal page overflow and a zero scroll position after navigation. The desktop viewport also matched its document width, and the browser console reported no warnings or errors.

### Iteration 5

- [P1] History, Weight, and Program still inherited legacy light surfaces and lacked the visual quality of the workout logger.
- Fix: rebuilt the supporting-screen presentation around explicit dark surfaces, lime hierarchy, stronger typography, responsive stat cards, cleaner data-entry controls, tactile program rows, and a single consistent settings treatment. The app is now intentionally dark-only to prevent mixed-theme white panels.
- Post-fix evidence: all three screens were visually inspected at desktop and 390 × 844 mobile sizes. Mobile document and viewport widths matched at 390px, the rest-duration control rendered with 60 seconds selected, and the browser console reported no warnings or errors.

### Iteration 6

- [P1] Settings were presented as a temporary header panel, mixing training preferences, app maintenance, account controls, and developer information without a durable information hierarchy.
- Fix: added Settings as a fifth primary destination and organized it into numbered Training, Data & Device, Account, and expandable Diagnostics sections. Removed the duplicate header gear and preserved the 60-second rest default as a clear segmented preference.
- Post-fix evidence: the dedicated screen was inspected at desktop and 390 × 844 mobile sizes. The mobile document and viewport widths both measured 390px, all five navigation destinations remained reachable, and the browser console reported no warnings or errors.

### Iteration 7

- [P1] Today suppressed the shared brand header, five bottom-navigation items were crowded on small phones, secondary copy lacked contrast, and the large vertical exercise hero pushed the logging controls below the first iPhone SE viewport.
- Fix: restored the shared Gym Notebook header everywhere, moved Settings to the persistent header gear, returned primary navigation to four items, raised muted-text contrast, normalized alignment, and introduced a short-phone layout with the 3D exercise art beside the exercise title.
- Post-fix evidence: at 375 × 667, the active workout shows the header, exercise context, Weight, Reps, and Log Set without scrolling; History and Settings remain aligned with no horizontal overflow. Desktop document and viewport widths matched at 1069px, and the browser console reported no warnings or errors.

### Iteration 8

- [P2] The generic Gym Notebook identity felt unfinished, and focus-mode Today expanded beyond the shared centered application grid, leaving its brand header visually offset from the other destinations.
- Fix: rebranded the product as Repwise across visible UI, document metadata, install metadata, update messaging, and backup filenames; constrained the Today shell to the same 1040px centered grid as every other page.
- Post-fix evidence: the browser title and visible brand both read Repwise, Today is centered at the desktop viewport with no horizontal overflow, and the production build passes.

### Iteration 9

- [P1] Primary navigation was oversized and visually off-center; History used generic trophy glyphs; recent activity was text-only; Program day tiles were too tall; Settings had no accent choice.
- Fix: constrained and centered the four-item navigation at mobile and desktop breakpoints, replaced trophies with the mapped 3D bench/squat/deadlift art, added an eight-week activity bar chart, defaulted History to meaningful workouts from the last 90 days with 30-day and All-time controls, compacted the swipeable Program strip, and added four persistent accent palettes.
- Post-fix evidence: at 375 × 667, Today retains all set-entry controls above the fold, History shows correct 3D lift art and the activity chart, Program shows a compact horizontal schedule, Violet updates the settings selection and shared UI tokens, and the browser console reports no warnings or errors. The default desktop view shows a centered 540px navigation container.

## Primary interactions tested

- Changed workout date to a scheduled training day.
- Entered weight and reps.
- Verified Log set enables only with valid values.
- Logged a set and verified progress increment, next-set advance, rest timer, undo, and note affordance.
- Undid the test set and cleared the temporary values.
- Checked browser console warnings/errors: none.
- Verified Today, History, Weight, and Program at a 390 × 844 mobile viewport with no horizontal overflow.
- Verified desktop navigation and page width after restoring the normal viewport.
- Switched History ranges, inspected the eight-week chart, and confirmed abandoned zero-set drafts do not appear in the record.
- Selected the Violet accent and confirmed the live token update before restoring the normal browser viewport.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- [P3] A bundled condensed display face could bring the exercise heading even closer to the source, but the current typography is clear and structurally faithful.

final result: passed
