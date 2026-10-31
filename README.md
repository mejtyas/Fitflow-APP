# Lixo Mobile

Lixo Mobile is the Expo/React Native version of the Lixo workout tracker for Android and iOS. All data lives in a local SQLite database on the device: there is no account, no server, and the app works fully offline.

## Included

- No sign-in: the app opens straight to the dashboard
- Dashboard summaries, weekly rhythm, recent activity, and active-session resume
- Workout and exercise creation, editing, ordering, search, deletion, and notes
- Live workout logging with kg/reps, previous performance, warm-up suggestions, per-exercise rest settings, local crash recovery, and background rest notifications
- Workout history, editable timestamps and rest periods, delete/clear controls, CSV export, and native XLSX export
- Exercise progress charts, estimated one-rep max, statistics, local notes, and settings
- On-device SQLite storage (`expo-sqlite`) with versioned schema migrations and transactional writes

## Requirements

- Node.js 22.13+
- npm 10+
- An Android emulator/device, iOS simulator/device, or an Expo development build
- An Expo account for EAS cloud builds

<!-- AGENT: Expo SDK 54 is intentional. Read this section before changing package versions. -->
## Expo SDK compatibility

Lixo is intentionally pinned to **Expo SDK 54**. The project originally used
SDK 57, but the public Expo Go build available from the iOS App Store is version
54.0.2 and cannot load SDK 57 projects. The App Store can still report Expo Go as
fully updated because Apple does not allow a different SDK-specific Expo Go build
to be sideloaded onto a physical iPhone.

The downgrade keeps local iPhone testing available through the public Expo Go app.
It does not change the database schema, stored data, or Lixo features. Keep the Expo, React, React Native, Expo Router, Jest, and related
native-package versions in `package.json` aligned with SDK 54.

Upgrade beyond SDK 54 only when either a compatible Expo Go build is publicly
available for physical iPhones or testing has moved completely to signed
development/TestFlight builds. After any future SDK upgrade, run
`npx expo install --fix`, `npm run doctor`, `npm run validate`, and a full
multi-platform export.

## Local development

```bash
npm ci
npm start
```

Useful checks:

```bash
npm run validate
npm run test:coverage
npm run doctor
npx expo install --check
npx expo export --platform all
```

Because Lixo uses native notification modules, a development build is the representative test environment:

```bash
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile development
npm run dev
```

## EAS setup and releases

The app needs no environment variables. The EAS project is `@mejtyas/fitflow-app` (the `slug` in `app.config.js` must stay `fitflow-app` to match `extra.eas.projectId`). Build numbers are managed remotely by EAS (`appVersionSource: remote`).

Build and ship:

```bash
npx eas-cli login
npm run build:android:preview
npm run build:ios:preview
npm run build:ios:simulator
npm run build:all
npm run submit:ios      # uploads the latest iOS production build to TestFlight
```

The iOS bundle identifier is `com.fitflow.lixo` (App Store Connect app "Lixo Fitness", Apple ID `6792464629`). The Android package is `com.mejtyas.lixo`. Production credentials remain managed by the owning Expo/Apple/Google accounts and are intentionally not committed.

## Data and failure safety

Data is stored in `lixo.db`, a SQLite database in the app's sandbox. The schema lives in `src/lib/db.ts`; each release appends migrations there and the app upgrades the database on launch using `PRAGMA user_version`. Never edit a shipped migration. Every mutation runs in an immediate transaction through one serialized write queue, and foreign keys cascade session, set and rest-period deletes. Exercises that appear in workout history cannot be deleted.

Active set edits are mirrored to AsyncStorage, saved with a short debounce, flushed when the app backgrounds, and must be saved before a workout can be finished.

Uninstalling the app deletes its data. Use the CSV/XLSX export in History to keep a backup. Destructive operations require confirmation, and deleting all data requires two confirmations.

On web, `expo-sqlite` uses wa-sqlite with OPFS: `metro.config.js` adds the `.wasm` asset and the cross-origin isolation headers, and only one browser tab can hold the database open at a time.

## Project layout

- `src/app` — Expo Router screens and navigation
- `src/components` — reusable mobile UI and chart/input components
- `src/hooks` — active-workout state, local recovery, debounced persistence, and timer orchestration
- `src/services` — typed SQLite queries and mutations
- `src/lib` — database and migrations (`db.ts`), validation, metrics, formatting, notifications
- `__tests__` — Jest unit, component, and service tests; service tests run against an in-memory SQLite database (`jest/node-sqlite.ts`, Node's built-in `node:sqlite`)

## Release checklist

1. Run `npm ci` and `npm run validate` on a clean checkout.
2. Run `npm run doctor`, `npx expo install --check`, and `npx expo export --platform all`.
3. Test a complete workout, app restart mid-workout, timer notification, history export, and data deletion on one Android and one iOS device.
4. Build preview binaries and complete platform store privacy, screenshots, signing, and internal-testing requirements.
5. Build the production artifacts with `npm run build:all`.
