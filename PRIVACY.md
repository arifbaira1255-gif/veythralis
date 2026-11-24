# Zuno privacy architecture

Everything below is verified by `node scripts/verify-privacy.mjs`, which runs the real
injected scripts in a real Chromium and compares against a stock one. That script is run by
CI before the APK is built, so a regression cannot ship.

```
24 checks · 0 failures · ALL_PASS = true
```

---

## The threat this addresses

A site wants to answer one question: *is this visitor the same person who came before?*
It has several independent ways to ask, and closing only one of them is useless — the
answers can be cross-checked. So the design closes all of them, and refuses to introduce a
contradiction that would itself be identifying.

That last point is the one most "anti-fingerprinting" browsers get wrong, and the first
version of this one did too. See *Mistakes found and fixed* below.

---

## Layer 1 — identity

Each session mints a seed, and the seed derives the whole profile: user agent, platform,
screen, colour depth, DPR, cores, memory, timezone, language, fonts, WebGL vendor and
renderer, canvas/audio/geometry noise, battery, connection, voices, media devices.

Two identities derived from different seeds are uncorrelated. A refresh mints a new seed, so
the next visit is a different person as far as every derived value is concerned.

**Coherence is enforced, not hoped for.** The Client Hints major version is read *out of*
the user agent string rather than chosen separately (`chMajor` in `fingerprint.ts`), so a UA
claiming `Chrome/131` can never ship a brand list saying `130`. Verified over 8 profiles:
`UA major == chMajor == brand version` holds for all.

---

## Layer 2 — what the page can observe

| Surface | Treatment | Why it matters |
|---|---|---|
| `navigator.userAgent`, `.platform`, `.vendor` | profile values | the basic ask |
| `navigator.userAgentData` | synthesised, version-synced | Chrome 131 has UA-CH; WebView does not. Without this the "Chrome" claim is provably false |
| `window.chrome` | shape supplied | same: absent in WebView, present in Chrome |
| `navigator.plugins`, `.mimeTypes`, `pdfViewerEnabled` | 5 PDF plugins | an empty plugin list beside a Chrome UA is a flag |
| `screen.*`, `devicePixelRatio` | profile values | — |
| `Intl.DateTimeFormat().resolvedOptions().timeZone` | profile value | — |
| `Date.prototype.getTimezoneOffset` | profile offset | the UA and the TZ must agree |
| canvas 2D `toDataURL` / `toBlob` / `getImageData` | ±1 on a seed-derived stride | see *Mistakes* — the original did nothing |
| `OffscreenCanvas` `getImageData` | same treatment | the Worker-side route bypasses DOM patches entirely |
| WebGL `UNMASKED_VENDOR/RENDERER`, limits | profile values | — |
| WebGL `getShaderPrecisionFormat` | `127,127,23` | in every serious WebGL fingerprint, not covered by renderer spoofing |
| `AudioBuffer.getChannelData` | drift `~1e-7` | the render route, which fp-collect-style scripts use |
| `document.fonts` (`size`, iteration) | profile font list | highest-entropy signal on Android |
| `performance.memory` | present, plausible | Chrome-only; absent reads as WebView |
| `matchMedia` (`min-width`, `max-width`, pointer, hover, colour-scheme) | answered from the profile | `screen.*` spoofing alone does **not** hide these — they answer about the real viewport |
| `window.name` | forced empty | survives cross-origin navigation; a tracker can use it with no cookie at all |
| `history.length` | `1` | its exact value encodes how you arrived |
| `navigator.doNotTrack` | `"1"` | — |
| `Referrer-Policy` meta | `no-referrer` | — |
| WebRTC `RTCPeerConnection` | removed (optional) | leaks the real IP past any proxy |

---

## Layer 3 — persistence

Five separate stores, and the app clears all five. Native `clearCache()` reaches exactly one
of them.

| Store | Cleared by | Reachable from JS |
|---|---|---|
| Cookies | in-page expiry across every path/domain combination | yes |
| `localStorage` / `sessionStorage` | `clear()` | yes |
| IndexedDB | `indexedDB.deleteDatabase` for every db | yes |
| Cache Storage | `caches.delete` for every key | yes |
| Service workers | `registration.unregister()` | yes |
| HTTP cache | `WebView.clearCache(true)` | no — native |

The purge order matters and is why auto-refresh is a *sequence*, not a `reload()`:

```
1. WIPE    purge the origin from inside the page, while it still exists
2. ROTATE  mint a new seed → new UA, new noise, new everything
3. CLEAR   WebView.clearCache(true)
4. LOAD    re-request the URL as the new persona
```

Verified against `https://example.com` after seeding a fake tracker:

```
localStorage    1 -> 0
sessionStorage  1 -> 0
cookies        13B -> 0B
IndexedDB       trackerdb -> none
Cache Storage   tracker-cache -> none
```

---

## Layer 4 — network exit

This is the layer Zuno does **not** solve, and the panel says so instead of showing a green
padlock.

There is no such thing as a free residential proxy. The lists that advertise one are paid
trials of datacenter IPs (Webshare 1 GB, Decodo 100 MB/3 days, Nodemaven 1 GB) or open
proxies scraped from compromised hosts. **An open proxy sees every URL and every cookie in
plaintext** — shipping one in a privacy browser would be actively harmful, so it is
deliberately not offered and the UI says why.

What is offered:

- **Direct** — your own IP. Everything else above still applies, but sites that log IPs can
  still group visits from your network.
- **Tor via Orbot** — genuinely free, open source, audited. Zuno probes `127.0.0.1:8118`
  and uses it when it answers. It cannot install or drive Orbot: Android will not route one
  app through a SOCKS proxy without native code.
- **Custom proxy** — for an endpoint you control. Not selectable until an address is entered.

A real per-app VPN needs `VpnService` plus a remote endpoint, i.e. native code and a
server. That is out of scope for a TypeScript change and is stated as such.

---

## Auto-refresh

Set a duration (seconds, minutes or hours); the active tab reloads on that timer and every
cycle runs the full four-step sequence above.

Accepted input: `30s`, `30 seconds`, `5m`, `5 min`, `2h`, `2 hours`, `1h30m`, or a bare
number (read as minutes). Off is `off`, `0`, or empty. Range is 5 s to 24 h; a value outside
it is clamped and the applied value is written back into the field so nothing happens
silently. Unparseable text is rejected with a message rather than guessed at.

`rotateOnReload` extends the same behaviour to manual reloads.

The chrome shows a live countdown while it is armed.

---

## Mistakes found and fixed

Recorded because each was a real hole, not a typo, and two of them were found only by
running the code in a browser instead of reasoning about it.

**1. `Math.floor(noise * 7)` was zero.** `canvasNoise` is in `[0,1)`, so
`Math.floor(noise * 7)` is `0` for ~86% of seeds — and for every seed below `0.143`. The
canvas fingerprint was therefore *identical to a stock browser* most of the time. Measured:
injected and stock hashes matched. Replaced with a seed-derived `±1` on a sparse stride,
which is guaranteed non-zero. Now 8/8 seeds give distinct hashes and none equals stock.

**2. A Chrome user agent with a WebView shape.** The UA claimed `Chrome/131` while
`window.chrome` was absent, `navigator.userAgentData` was absent and `navigator.plugins` was
empty. Each of those is a one-line WebView check — the browser was *more* identifiable than
an honest one. All three are now supplied and version-synced.

**3. `document.fonts.size` contradicted its own enumeration.** `size` was patched but
iteration was not, so `size` reported 11 while the iterator yielded the device's real fonts.

**4. The build was resolving undeclared native modules.** `react-native-reanimated` and
`react-native-gesture-handler` were pulled in transitively at open ranges; npm took the
latest majors whose peer ranges exclude React Native 0.86.3, so `assembleRelease` failed an
assertion. Pinned to the Expo SDK 57 versions with an `overrides` block. (Fixed in the
previous round; recorded here because it was the same class of bug — a claim that did not
match reality.)

---

## What is not covered

- **The Android WebView itself.** Chromium and WebView share Blink, but the final behaviour
  on a device is only provable on a device. `scripts/verify-privacy.mjs` proves the script is
  coherent and effective in Blink; it does not prove the APK on your phone.
- **IP address.** See layer 4. This is the single largest remaining identifier and it is not
  solved.
- **Automated behaviour.** A fresh canvas hash every visit is itself a signal: no real user
  has a new GPU every thirty seconds. Against a determined classifier this trades
  linkability for anomaly.
- **Server-side correlation.** If two sites share a backend, rotating the identity between
  them changes nothing about that backend's records.
- **Play Store signing.** CI signs with the debug keystore. Installing works; publishing
  needs your own key.
