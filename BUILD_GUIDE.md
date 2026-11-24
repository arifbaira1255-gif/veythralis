# Veythralis — build it, put it on GitHub, get an APK

**Veythralis** is a privacy-hardened Android browser. It blocks trackers and telemetry,
isolates every tab's storage and cookies, and randomizes your browser fingerprint each
session — while deliberately leaving ads visible.

Package id: `com.veythralis.browser` · Expo SDK 57 · React Native + TypeScript

---

## 1. What is in this project

```
veythralis/
├── app.json                     app identity, permissions, splash
├── eas.json                     build profiles (preview = APK)
├── package.json
├── .github/workflows/android.yml  CI: builds the APK on every push
├── src/
│   ├── app/
│   │   ├── _layout.tsx          root stack
│   │   └── (tabs)/
│   │       ├── _layout.tsx      bottom tabs: Browse / Settings
│   │       ├── index.tsx        the browser screen (WebView, tabs, nav, shield)
│   │       └── settings.tsx     all privacy toggles + burn timer
│   ├── components/
│   │   ├── AddressBar.tsx       URL bar with lock / warning indicator
│   │   ├── TabBar.tsx           multi-tab strip
│   │   ├── ShieldPanel.tsx      trackers blocked + live fingerprint + headers + wipe
│   │   ├── HomeScreen.tsx       start page
│   │   ├── screen.tsx           page container
│   │   └── ui/                  Button, Card, TextField, ConfirmDialog, EmptyState
│   ├── constants/theme.ts       palette (light + dark) + BRAND constants
│   └── lib/
│       ├── blocklist.ts         tracker domains + ad-delivery allowlist
│       ├── fingerprint.ts       per-session profile + injected patch script
│       ├── header-rules.ts      GPC / referrer / client-hint rules
│       ├── privacy-settings.ts  persisted toggles
│       ├── session-burn.ts      burn timer intervals + countdown
│       ├── tab-isolation.ts     per-tab identity and blocked counters
│       ├── url.ts               URL vs search detection, https upgrade
│       ├── storage.ts           AsyncStorage wrapper
│       └── config.ts            EXPO_PUBLIC_API_URL (unused here)
└── assets/images/icon.png
```

### How each requirement is implemented

| Requirement | Where | How |
|---|---|---|
| Isolate cookies / localStorage / IndexedDB / cache per site | `tab-isolation.ts`, `fingerprint.ts`, `index.tsx` | Each tab gets an id; the injected script namespaces `localStorage`, `sessionStorage`, `indexedDB` names **and `document.cookie`** with that id, so two tabs on one origin cannot read each other. The WebView runs `incognito` with `cacheEnabled={false}`, so nothing persists to the app's cookie jar and closing the tab discards cookies and cache. |
| Randomize fingerprint each session | `fingerprint.ts` | A fresh seed per session drives a mulberry32 PRNG that picks one *coherent* device profile: canvas pixel noise, WebGL vendor/renderer + GPU limits, font set, screen size + DPR, timezone, language, user-agent, `hardwareConcurrency`, `deviceMemory`, touch points, **audio-context noise, media devices, battery, network info, storage quota, speech voices**. Injected before content loads. |
| Separate identity per tab | `index.tsx` (`profileFor`) | When enabled, each tab derives its own profile from `sessionSeed:tabId`, so two tabs never share an identity. |
| Block trackers, keep ads | `blocklist.ts` | ~200 tracker/analytics/telemetry hosts are blocked by hostname suffix. `AD_DELIVERY_HOSTS` is checked **first** and always allowed, so ad creatives still render. |
| Clear on exit + instant clear | `privacy-settings.ts`, `ShieldPanel.tsx`, `index.tsx` | `clearOnExit` toggle; the shield panel's red button wipes storage, IndexedDB, Cache API, clears the WebView cache and rotates the fingerprint seed. |
| Session burn timer | `session-burn.ts`, `index.tsx` | A countdown from the last reset (not an idle timer, which a page can defeat). On expiry every tab's data is wiped and the seed rotates. |
| HTTPS-only, DoH, referrer, third-party cookies | `settings.tsx`, `index.tsx` | HTTPS-only upgrades `http://` navigations in place; DoH endpoint is `cloudflare-dns.com`; referrer is stripped via injected meta; third-party cookies map to `thirdPartyCookiesEnabled={false}`. |
| Global Privacy Control | `header-rules.ts` | `Sec-GPC: 1` is added to every request — a legally binding opt-out, not a polite hint. |
| WebRTC IP-leak protection | `fingerprint.ts` | Local-IP and srflx candidates are filtered out of SDP in `setLocalDescription` and `createOffer`. |
| Coarsened timers | `fingerprint.ts` | `performance.now()` is rounded to defeat timer side channels. |
| Address bar, tabs, back/forward/reload, home, shield panel | `AddressBar.tsx`, `TabBar.tsx`, `index.tsx`, `ShieldPanel.tsx` | All present, plus Android hardware-back handling. |

### Honest limits (also shown in the app's Settings → About)

- **Not Tor.** Your IP address is still visible to every site you visit.
- **Fingerprint randomization is mitigation, not invisibility.** It raises the cost of
  cross-site correlation; it does not defeat TLS/JA3 fingerprinting, IP, or server-side
  behaviour.
- **Cookies are namespaced per tab in the page's view, and the WebView runs incognito.**
  React Native's WebView keeps one underlying cookie store per app process, so this is
  isolation by namespace and lifetime rather than a separate native jar per tab.
- **DNS over HTTPS is a setting, not a tunnel.** The WebView resolves through the system
  resolver; the toggle records your intent and the endpoint, and a native DoH client would
  be the next step.
- The blocklist is a curated static list, not a live EasyList subscription.

---

## 2. Run it on your computer (Expo Go, ~5 minutes)

You need **Node.js 20 or newer** — https://nodejs.org

```bash
# 1. unzip, then from inside the folder:
npm install

# 2. start the dev server
npx expo start
```

Install **Expo Go** from the Play Store on your Android phone, then scan the QR code the
terminal prints. The app opens on your phone.

> Note: `react-native-webview` is a native module. It works in Expo Go on Android, but if
> you hit a "native module not found" error, go straight to the APK build in section 4 —
> that always works.

---

## 3. Put it on GitHub

```bash
cd veythralis

git init
git add .
git commit -m "Veythralis: privacy-hardened Android browser"

# create an empty repo on github.com first (no README, no .gitignore),
# then point at it — replace YOURNAME:
git remote add origin https://github.com/YOURNAME/veythralis.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `.expo/`, `android/`, `ios/`, `.env` and
build output, so the repo stays small and no keys are committed.

---

## 4. Build the APK with GitHub Actions (free, no local Android SDK, no Expo account)

This is the recommended path and it needs **no secrets at all**. GitHub's runner does the
build with Gradle directly and you download the APK from the run's artifacts. The workflow
is already in the repo at **`.github/workflows/android.yml`**.

### 4a. What the workflow does

On every push to `main` (or when you press **Run workflow**), it:

1. checks out the repo, installs Node 22, JDK 17 and the Android SDK;
2. generates the app icon;
3. runs `npm install`;
4. type-checks with `npx tsc --noEmit`;
5. verifies the JS bundle compiles with `npx expo export --platform android`;
6. runs `npx expo prebuild --platform android` to generate the native project;
7. runs `./gradlew assembleRelease` to build the release APK;
8. collects the APK and uploads it as the **`zuno-apk`** artifact.

### 4b. Download your APK

1. Open your repo → **Actions** tab → the **Build Android APK** run.
2. When it goes green, scroll to **Artifacts** → download **`zuno-apk`**.
3. Unzip it, copy the `.apk` to your phone, tap it, and allow "install unknown apps"
   when Android asks.

The first build takes ~20–25 minutes on a cold Gradle cache; later runs are much faster
because the Gradle cache is reused.

### 4c. If the build ever goes red again

The one failure this project actually hit was a native-module version mismatch:

```
[Reanimated] Your installed version of React Native (0.86.3) is not compatible
with installed version of Reanimated (4.8.0)
```

`react-native-reanimated` was not declared in `package.json`, so npm resolved it
transitively to 4.8.0, which requires React Native 0.87–0.89. The fix pins
`react-native-reanimated@4.5.1`, `react-native-worklets@0.10.1` and
`react-native-gesture-handler@~2.32.0` (the Expo SDK 57 versions) and adds an
`overrides` block so a transitive range cannot pull a newer major again.
Full detail in **`FIXES.md`**.

**Do not remove the `overrides` block** — it is what keeps the build green. When you
upgrade the Expo SDK, run `npx expo install --check` and let it rewrite those three pins.

---

## 5. Build the APK locally instead (optional)

If you would rather not use CI:

```bash
npm install -g eas-cli
eas login
eas init
eas build --platform android --profile preview
```

When it finishes, the terminal prints a link and a QR code. Open it on your phone to
download the APK. `eas.json`'s `preview` profile is already set to `buildType: apk` with
`distribution: internal`, so you get a directly installable file rather than an `.aab`.

---

## 6. iPhone and Google Play (optional)

- **iPhone** needs an Apple Developer Program membership (99 USD/year):
  `eas build --platform ios --profile production` then `eas submit --platform ios`.
- **Google Play** needs a developer account (one-time 25 USD):
  `eas build --platform android --profile production` then `eas submit --platform android`.

---

## 7. What was and was not checked

**Checked:** the code type-checks under TypeScript strict mode (`npx tsc --noEmit`),
`npx expo-doctor` reports 21/21 checks passing, and the full GitHub Actions run
(#23 on `main`) completed every step including `./gradlew assembleRelease` and
uploaded the `zuno-apk` artifact (46.36 MB).

**Not checked:** running on a real phone. Nothing in this environment can install or launch
an Android app, so the WebView behaviour, the injected fingerprint script against live
sites, and the tracker counter have not been exercised on a device. Test the installed app
before sharing it, and report anything that misbehaves with a screenshot.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `Native module RNCWebView not found` | You are in Expo Go on a platform without the module. Build the APK (section 4). |
| `[Reanimated] ... not compatible with installed version of Reanimated` | The `overrides` block in `package.json` was removed or bypassed. Restore it and re-run `npm install`. |
| `expo-doctor` reports a version mismatch | Run `npx expo install --check` and accept its rewrites. |
| A site renders blank | It may depend on a blocked tracker host. Add the host to `AD_DELIVERY_HOSTS` in `src/lib/blocklist.ts` if it is genuinely content. |
| Ads disappear on a site | That site serves ads from a tracker domain. Add the domain to `AD_DELIVERY_HOSTS`. |
| Fingerprint looks unchanged | Tap **Clear all browsing data** in the shield panel — that rotates the seed. |
| Session wipes too often | Settings → Session burn timer → set it to Off or a longer interval. |
