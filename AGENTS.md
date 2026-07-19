# Expo SDK policy

- This project is intentionally pinned to Expo SDK 54 so it works with the public
  iOS Expo Go 54.0.2 app on physical iPhones.
- Read `README.md` → `Expo SDK compatibility` before changing Expo, React,
  React Native, Expo Router, Jest, or native-package versions.
- Do not upgrade beyond SDK 54 unless a compatible public iOS Expo Go build is
  available or the user explicitly accepts signed development/TestFlight-only
  testing.
- After an approved SDK change, run `npx expo install --fix`, `npm run doctor`,
  `npm run validate`, and `npx expo export --platform all`.
