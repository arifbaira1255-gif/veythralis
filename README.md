# Veythralis

A privacy-hardened Android browser. Trackers blocked, every tab isolated, a fresh
fingerprint every session — and ads deliberately left visible.

Built with Expo SDK 57 · React Native · TypeScript.

## What it does

- **Tracker blocking without ad blocking.** ~200 analytics, telemetry, session-replay and
  retargeting hosts are blocked by hostname. Ad *delivery* domains are checked first and
  always allowed, so ads still render — only the measurement around them stops.
- **Per-tab isolation.** Each tab namespaces `localStorage`, `sessionStorage`,
  `IndexedDB` **and `document.cookie`** under its own id, and runs the WebView in incognito
  with caching off, so one site cannot read another's data and closing a tab discards its
  cookies and cache.
- **Fingerprint randomization, per session or per tab.** A fresh seed produces one
  coherent device profile — canvas noise, WebGL vendor/renderer and GPU limits, font set,
  screen size and DPR, timezone, language, user-agent, `hardwareConcurrency`,
  `deviceMemory`, touch points, **audio-context noise, media device list, battery, network
  information, storage quota, speech voices** — injected before any page script runs.
- **Session burn timer.** A hard ceiling on session lifetime: after 5/15/30/60 minutes
  every tab's data is destroyed and the fingerprint rotates, so a session left open all
  day cannot accumulate a profile.
- **Global Privacy Control.** Sends `Sec-GPC: 1`, a legally binding opt-out from the sale
  or sharing of personal data under CCPA/CPRA and similar laws.
- **WebRTC IP-leak protection.** Strips local-IP candidates from SDP, closing the classic
  VPN-bypass leak.
- **Coarsened high-resolution timers.** `performance.now()` is rounded, defeating
  timer-based side-channel fingerprinting.
- **Clear on exit, or instantly.** A toggle wipes everything when the app closes; the
  shield panel's red button wipes storage, IndexedDB, the Cache API and the WebView cache,
  then rotates the fingerprint.
- **HTTPS-only, DNS over HTTPS, referrer stripping, third-party cookie blocking.**
- **A real browser UI.** Address bar with a lock/warning indicator, tab strip,
  back/forward/reload/home, and a shield panel showing trackers blocked, the live
  fingerprint, the request headers being sent, and the burn countdown.

## Honest limits

- **Not Tor.** Your IP address is still visible to every site you visit.
- Fingerprint randomization raises the cost of cross-site correlation; it does not defeat
  TLS/JA3 fingerprinting, IP, or server-side behaviour.
- Cookies are namespaced per tab in the page's view, and the WebView runs incognito so
  nothing persists — but React Native's WebView keeps one underlying cookie store per app
  process, so this is isolation by namespace and lifetime, not a separate native jar per
  tab.
- DNS over HTTPS is a setting and an endpoint, not a tunnel; the WebView still resolves
  through the system resolver.
- The blocklist is a curated static list, not a live EasyList subscription.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go on Android.

## Build an APK

See **[BUILD_GUIDE.md](./BUILD_GUIDE.md)** for the full walkthrough: local Expo build,
pushing to GitHub, and building the APK with GitHub Actions
(`.github/workflows/android.yml` is already included).

## Verified

`npx tsc --noEmit` passes under strict mode, and the Android JavaScript bundle compiles
with Metro. It has **not** been run on a physical device — nothing in the build environment
can install or launch an Android app.

## License

MIT
