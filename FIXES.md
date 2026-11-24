# APK build fixes

The GitHub Actions APK build (`.github/workflows/android.yml`) was failing on every
run. This document lists each error that was found, its root cause, and the exact fix.

---

## Error 1 — the build blocker

```
Execution failed for task ':react-native-reanimated:assertMinimalReactNativeVersionTask'.
Caused by: org.gradle.api.GradleException: [Reanimated] Your installed version of
React Native (0.86.3) is not compatible with installed version of Reanimated (4.8.0).
```

**Where it failed:** the `Build release APK` step (`./gradlew assembleRelease`).
Everything before it passed — `npm install`, `npx tsc --noEmit`, `npx expo export`,
and `npx expo prebuild` all succeeded. The failure was purely a native-module
version mismatch, caught by Reanimated's own Gradle assertion task.

**Root cause.** `react-native-reanimated` was never declared in `package.json`.
It arrives transitively through `expo-router` → `react-native-drawer-layout`
(which asks for `react-native-reanimated: ">= 2.0.0"`). With no lockfile committed
and no explicit pin, npm resolved that open range to the newest 4.x — **4.8.0** —
whose peer range is `react-native: "0.87 - 0.89"`. This project is on
**react-native 0.86.3**, so the assertion failed.

Expo SDK 57 pins a specific compatible version, and it is not 4.8.0:

| module | what npm installed | Expo SDK 57 pin |
|---|---|---|
| `react-native-reanimated` | 4.8.0 | **4.5.1** |
| `react-native-worklets` | 0.14.0 | **0.10.1** |
| `react-native-gesture-handler` | 3.5.0 | **~2.32.0** |

`react-native-reanimated@4.5.1` declares `react-native: "0.83 - 0.86"`, which
**0.86.3 satisfies**.

**Fix.** Declare all three modules explicitly at the Expo SDK 57 versions, and add
an `overrides` block so a transitive range can never pull a newer major again:

```json
"dependencies": {
  "react-native-gesture-handler": "~2.32.0",
  "react-native-reanimated": "4.5.1",
  "react-native-worklets": "0.10.1"
},
"overrides": {
  "react-native-reanimated": "4.5.1",
  "react-native-worklets": "0.10.1",
  "react-native-gesture-handler": "~2.32.0"
}
```

---

## Error 2 — latent, would have failed next

`react-native-gesture-handler` was also undeclared and resolved to **3.5.0**
(a major version above Expo SDK 57's `~2.32.0`). It did not fail the build yet
because Reanimated's assertion runs first, but a major-version jump in a native
module is a real breakage risk. Fixed by the same pin above.

`react-native-worklets` (Reanimated 4's required companion) had the same problem:
0.14.0 installed vs 0.10.1 pinned. Fixed by the same pin.

---

## Error 3 — no lockfile committed

`package-lock.json` was not in the repository, so every CI run re-resolved the
whole dependency tree from scratch and could drift onto incompatible versions at
any time. The `overrides` block added above now makes resolution deterministic
even without a lockfile.

---

## Verification performed

- `npm install` from a clean tree (`node_modules` and lockfile removed) — succeeds.
- Installed versions now match the Expo SDK 57 pins exactly.
- `react-native-reanimated@4.5.1` peer range `0.83 - 0.86` is satisfied by the
  installed `react-native@0.86.3`.
- `npx expo-doctor` — **21/21 checks passed. No issues detected.**
- `npx tsc --noEmit` — passes.

The native Gradle build itself is verified by the GitHub Actions workflow, which
is the only place it can be run for this project.

---

## Files changed

- `package.json` — three modules pinned in `dependencies`, `overrides` block added.
- `FIXES.md` — this file.
