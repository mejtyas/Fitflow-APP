# FitFlow Mobile

FitFlow Mobile is the Expo/React Native rewrite of the FitFlow web app. It targets Android and iOS, connects directly to the existing Supabase project, and keeps the current schema, users, workouts, exercises, sessions, history, statistics, and feedback data.

## Included

- Email/password sign-in, registration, session restore, and sign-out
- Dashboard summaries, weekly rhythm, recent activity, and active-session resume
- Workout and exercise creation, editing, ordering, search, deletion, and notes
- Live workout logging with kg/reps, previous performance, warm-up suggestions, per-exercise rest settings, local crash recovery, and background rest notifications
- Workout history, editable timestamps and rest periods, delete/clear controls, CSV export, and native XLSX export
- Exercise progress charts, estimated one-rep max, statistics, feedback, and account settings
- Encrypted native auth persistence through SecureStore and user-scoped Supabase queries protected by the existing RLS policies

## Requirements

- Node.js 22.13+
- npm 10+
- An Android emulator/device, iOS simulator/device, or an Expo development build
- An Expo account for EAS cloud builds

<!-- AGENT: Expo SDK 54 is intentional. Read this section before changing package versions. -->
## Expo SDK compatibility

FitFlow is intentionally pinned to **Expo SDK 54**. The project originally used
SDK 57, but the public Expo Go build available from the iOS App Store is version
54.0.2 and cannot load SDK 57 projects. The App Store can still report Expo Go as
fully updated because Apple does not allow a different SDK-specific Expo Go build
to be sideloaded onto a physical iPhone.

The downgrade keeps local iPhone testing available through the public Expo Go app.
It does not change the Supabase project, database schema, stored user data, or
FitFlow features. Keep the Expo, React, React Native, Expo Router, Jest, and related
native-package versions in `package.json` aligned with SDK 54.

Upgrade beyond SDK 54 only when either a compatible Expo Go build is publicly
available for physical iPhones or testing has moved completely to signed
development/TestFlight builds. After any future SDK upgrade, run
`npx expo install --fix`, `npm run doctor`, `npm run validate`, and a full
multi-platform export.

## Environment

Copy `.env.example` to `.env` and use the same public Supabase values as the web app:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-key
```

Only the publishable/anon client key belongs in the app. Never add a Supabase service-role key. `.env` and EAS local files are ignored by Git.

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

Because FitFlow uses native notification and secure-storage modules, a development build is the representative test environment:

```bash
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile development
npm run dev
```

## EAS setup and releases

The three profiles in `eas.json` map to the EAS `development`, `preview`, and `production` environments. Add both environment variables to all three environments in the Expo dashboard or with EAS CLI, preserving their names exactly.

Link the repository to the Expo project once, then build:

```bash
npx eas-cli login
npx eas-cli init
npm run build:android:preview
npm run build:ios:preview
npm run build:ios:simulator
npm run build:all
```

The Android package and iOS bundle identifier are both `com.mejtyas.fitflow`. Production credentials remain managed by the owning Expo/Apple/Google accounts and are intentionally not committed.

## Data and failure safety

The mobile app does not create a second database or copy user records. It uses the original tables and RPC functions through the same Supabase URL. Auth refresh tokens are chunked and encrypted in platform SecureStore. Active set edits are mirrored locally, saved with a short debounce to avoid redundant requests, flushed when the app backgrounds, and must successfully sync before a workout can be finished. React Query deduplicates and caches reads while reconnect and foreground handlers refresh stale data.

Destructive operations require confirmation, and deleting all account data requires two confirmations. Supabase Row Level Security remains the final authorization boundary for every mobile request.

## Project layout

- `src/app` — Expo Router screens and navigation
- `src/components` — reusable mobile UI and chart/input components
- `src/hooks` — active-workout state, local recovery, debounced persistence, and timer orchestration
- `src/services` — typed Supabase queries and mutations
- `src/lib` — validation, metrics, formatting, secure persistence, notifications, and generated database types
- `__tests__` — Jest unit and component tests

## Release checklist

1. Run `npm ci` and `npm run validate` on a clean checkout.
2. Run `npm run doctor`, `npx expo install --check`, and `npx expo export --platform all`.
3. Test sign-in, a complete workout, timer notification, history export, and account deletion against a non-production test account on one Android and one iOS device.
4. Build preview binaries and complete platform store privacy, screenshots, signing, and internal-testing requirements.
5. Build the production artifacts with `npm run build:all`.
