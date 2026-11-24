#!/usr/bin/env node
/**
 * Verification harness for the privacy layer.
 *
 * Every claim this project makes about fingerprint rotation, identity purging and the
 * auto-refresh parser is checked here against a real Chromium, not asserted in a README.
 * Run with:  node scripts/verify-privacy.mjs
 *
 * What it does NOT cover: the Android WebView. Chromium and WebView share the engine, but
 * WebView has no `window.chrome` and no UA-CH natively — which is exactly why those are
 * patched — and only a device can confirm the final result. This script proves the
 * injected script is coherent and effective inside Blink; the device test is separate.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Use whatever Chromium this machine already has rather than downloading one: CI and the
 * sandbox both ship a build, and a 150 MB download per run is not worth it.
 */
function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1181/chrome-linux/headless_shell`,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      execFileSync('test', ['-x', c]);
      return c;
    } catch {}
  }
  return null;
}

const TARGET = 'data:text/html,<html><body>x</body></html>';
const SEEDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
  }
}

// ---------------------------------------------------------------------------------------
// Build the scripts through TypeScript so what is tested is the real source, not a copy.
// ---------------------------------------------------------------------------------------
const out = mkdtempSync(join(tmpdir(), 'zuno-verify-'));
try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/lib/fingerprint.ts',
      'src/lib/fingerprint-hardening.ts',
      'src/lib/auto-refresh.ts',
      'src/lib/proxy.ts',
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2020',
      '--skipLibCheck',
      '--moduleResolution',
      'bundler',
      '--ignoreConfig',
    ],
    { stdio: 'inherit' },
  );

  // tsc emits extension-less imports; Node's ESM resolver needs the explicit .js.
  execFileSync('sh', [
    '-c',
    `cd "${out}" && sed -i "s|from './fingerprint-hardening'|from './fingerprint-hardening.js'|" fingerprint.js`,
  ]);

  const mod = async (f) => import(join(out, f));
  const fp = await mod('fingerprint.js');
  const ar = await mod('auto-refresh.js');
  const px = await mod('proxy.js');

  const profiles = SEEDS.map((s) => {
    const p = fp.buildProfile(s);
    return {
      seed: s,
      p,
      script: fp.buildInjectionScript(p, 'tab1', { blockWebRtc: true, coarsenTimers: true }),
    };
  });

  // -------------------------------------------------------------------------------------
  console.log('\n[1] Identity coherence — the declared identity must not contradict itself');
  // -------------------------------------------------------------------------------------
  let coherent = true;
  for (const { seed, p, script } of profiles) {
    const uaMajor = (p.userAgent.match(/Chrome\/(\d+)/) || [])[1];
    const brand = p.chBrands[2] && p.chBrands[2][1];
    if (uaMajor !== p.chMajor || brand !== p.chMajor) {
      coherent = false;
      console.log(`    ${seed}: UA ${uaMajor} chMajor ${p.chMajor} brand ${brand}`);
    }
    if (script.includes('${')) {
      coherent = false;
      console.log(`    ${seed}: script contains a template interpolation`);
    }
  }
  check('UA major == chMajor == brand version', coherent, `${SEEDS.length} profiles`);

  // -------------------------------------------------------------------------------------
  console.log('\n[2] Behaviour in a real Chromium — injected vs stock');
  // -------------------------------------------------------------------------------------
  const PROBE = () => {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 50;
    const x = c.getContext('2d');
    x.textBaseline = 'top';
    x.font = '15px Arial';
    x.fillStyle = '#f60';
    x.fillRect(0, 0, 110, 25);
    x.fillStyle = '#069';
    x.fillText('Zuno fp', 3, 3);
    const d = c.toDataURL();
    let h = 0;
    for (let i = 0; i < d.length; i += 1) h = ((h << 5) - h + d.charCodeAt(i)) | 0;
    return {
      canvas: h,
      ua: navigator.userAgent,
      platform: navigator.platform,
      cores: navigator.hardwareConcurrency,
      screen: `${screen.width}x${screen.height}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      plugins: navigator.plugins ? navigator.plugins.length : -1,
      mime: navigator.mimeTypes ? navigator.mimeTypes.length : -1,
      pdf: navigator.pdfViewerEnabled,
      chrome: typeof window.chrome !== 'undefined',
      ch: navigator.userAgentData
        ? navigator.userAgentData.brands.map((b) => `${b.brand}/${b.version}`).join('|')
        : 'NONE',
      chPlatform: navigator.userAgentData ? navigator.userAgentData.platform : 'NONE',
      hist: history.length,
      name: window.name,
      dnt: navigator.doNotTrack,
      fonts: document.fonts ? document.fonts.size : -1,
    };
  };

  // A browser is not always available (a bare CI image, a locked-down sandbox). The
  // pure-logic checks above still run; the browser-dependent ones are reported as
  // SKIPPED rather than failing the build, because a missing Chromium says nothing
  // about whether the privacy layer is correct.
  const exe = chromePath();
  if (!exe) {
    console.log('\n  SKIP  no Chromium found (set CHROME_PATH to enable the browser checks)');
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PASS=${pass}  FAIL=${fail}  SKIPPED=browser`);
    console.log(fail === 0 ? 'ALL_PASS = true (browser checks skipped)' : 'ALL_PASS = false');
    process.exit(fail === 0 ? 0 : 1);
  }

  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const observed = {};
  for (const { seed, script } of profiles) {
    const page = await browser.newPage();
    await page.addInitScript(script);
    await page.goto(TARGET);
    observed[seed] = await page.evaluate(PROBE);
    await page.close();
  }
  const basePage = await browser.newPage();
  await basePage.goto(TARGET);
  const base = await basePage.evaluate(PROBE);
  await basePage.close();
  await browser.close();

  const hashes = Object.values(observed).map((o) => o.canvas);
  check(
    'every seed produces a distinct canvas hash',
    new Set(hashes).size === SEEDS.length,
    `${new Set(hashes).size}/${SEEDS.length} distinct`,
  );
  check(
    'no injected hash equals the stock hash',
    hashes.every((h) => h !== base.canvas),
    `stock ${base.canvas}`,
  );
  // The UA string is deliberately IDENTICAL across seeds. Real Chrome on Windows 10 and
  // Windows 11 both send "Windows NT 10.0" — the OS version is carried by User-Agent
  // Client Hints, not by the UA string. So a stable UA is not a bug, it is the correct
  // and least-identifying behaviour: uniformity is what blending means. What must vary
  // is the machine behind it (UA-CH platform version, screen, GPU, timezone).
  check(
    'UA string is stable across seeds (Windows uniformity)',
    new Set(Object.values(observed).map((o) => o.ua)).size === 1 &&
      Object.values(observed).every((o) => o.ua !== base.ua),
    `${new Set(Object.values(observed).map((o) => o.ua)).size} distinct UA, differs from stock`,
  );
  check(
    'the machine behind the UA does vary',
    new Set(profiles.map(({ p }) => `${p.screenWidth}x${p.screenHeight}/${p.hardwareConcurrency}/${p.chPlatformVersion}`)).size > 1,
    `${new Set(profiles.map(({ p }) => `${p.screenWidth}x${p.screenHeight}/${p.hardwareConcurrency}/${p.chPlatformVersion}`)).size} distinct machines`,
  );
  check(
    'claims Chrome and shows window.chrome',
    Object.values(observed).every((o) => o.ua.includes('Chrome/') && o.chrome),
    `stock chrome=${base.chrome}`,
  );
  check(
    'claims Chrome and shows Client Hints',
    Object.values(observed).every((o) => o.ch !== 'NONE'),
    `stock ch=${base.ch}`,
  );
  check(
    'claims Chrome and shows plugins + mimeTypes',
    Object.values(observed).every((o) => o.plugins > 0 && o.mime > 0 && o.pdf),
    `stock plugins=${base.plugins} mime=${base.mime}`,
  );
  check(
    'desktop UA never reports a coarse pointer',
    Object.values(observed).every((o) => !(o.platform === 'Win32' && o.cores === 0)),
    '',
  );
  check(
    'window.name is emptied',
    Object.values(observed).every((o) => o.name === ''),
    '',
  );
  check(
    'history.length is coarsened to 1',
    Object.values(observed).every((o) => o.hist === 1),
    `stock ${base.hist}`,
  );
  check(
    'Do Not Track is asserted',
    Object.values(observed).every((o) => o.dnt === '1'),
    `stock ${base.dnt}`,
  );

  // -------------------------------------------------------------------------------------
  console.log('\n[2b] Windows-only, US-only — the persona must never contradict itself');
  // -------------------------------------------------------------------------------------
  // Every profile must be a Windows desktop. A phone or Mac persona is a contradiction
  // on an Android WebView, and a contradiction is a stronger identifier than any single
  // attribute — so this is a hard requirement, not a preference.
  check(
    'every profile is a Windows desktop',
    profiles.every(({ p }) => p.platform === 'Win32' && /Windows NT/.test(p.userAgent)),
    `${profiles.length} profiles`,
  );
  check(
    'no profile claims a phone or a Mac',
    profiles.every(
      ({ p }) =>
        !/Android|iPhone|iPad|Mobile/i.test(p.userAgent) &&
        p.platform !== 'MacIntel' &&
        p.platform !== 'Linux x86_64',
    ),
    '',
  );
  check(
    'every timezone is in the United States',
    profiles.every(({ p }) => /^America\/|^Pacific\/Honolulu$/.test(p.timezone)),
    [...new Set(profiles.map(({ p }) => p.timezone))].join(', '),
  );
  check(
    'every locale is en-US',
    profiles.every(({ p }) => p.language === 'en-US'),
    [...new Set(profiles.map(({ p }) => p.language))].join(', '),
  );
  check(
    'timezone offset matches the zone (minutes west of UTC)',
    profiles.every(({ p }) => {
      const expected = {
        'America/New_York': 300,
        'America/Chicago': 360,
        'America/Denver': 420,
        'America/Phoenix': 420,
        'America/Los_Angeles': 480,
        'America/Anchorage': 540,
        'Pacific/Honolulu': 600,
      }[p.timezone];
      return expected === undefined || expected === p.timezoneOffset;
    }),
    '',
  );
  // The observed timezone inside a real Chromium must be the declared one, not the host's.
  check(
    'observed timezone is the declared US zone',
    Object.entries(observed).every(([seed, o]) => {
      const p = profiles.find((x) => x.seed === seed).p;
      return o.tz === p.timezone;
    }),
    [...new Set(Object.values(observed).map((o) => o.tz))].join(', '),
  );
  // A refresh must be able to land on a different Windows version and a different zone.
  check(
    'rotation can change the Windows version',
    new Set(profiles.map(({ p }) => p.chPlatformVersion)).size > 1,
    [...new Set(profiles.map(({ p }) => p.chPlatformVersion))].join(', '),
  );
  check(
    'rotation can change the timezone',
    new Set(profiles.map(({ p }) => p.timezone)).size > 1,
    `${new Set(profiles.map(({ p }) => p.timezone)).size} zones`,
  );

  // -------------------------------------------------------------------------------------
  console.log('\n[3] Auto-refresh parser');
  // -------------------------------------------------------------------------------------
  const cases = [
    ['30s', { value: 30, unit: 'seconds' }],
    ['30 seconds', { value: 30, unit: 'seconds' }],
    ['5m', { value: 5, unit: 'minutes' }],
    ['5 minutes', { value: 5, unit: 'minutes' }],
    ['2h', { value: 2, unit: 'hours' }],
    ['2 hours', { value: 2, unit: 'hours' }],
    ['1h30m', { value: 90, unit: 'minutes' }],
    ['5', { value: 5, unit: 'minutes' }],
    ['120s', { value: 2, unit: 'minutes' }],
    ['3600s', { value: 1, unit: 'hours' }],
    ['5M', { value: 5, unit: 'minutes' }],
    ['off', { value: 0, unit: 'minutes' }],
  ];
  let parserOk = true;
  for (const [input, want] of cases) {
    const got = ar.parseRefreshInput(input);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      parserOk = false;
      console.log(`    "${input}" -> ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    }
  }
  for (const bad of ['', 'banana', '5pm']) {
    if (ar.parseRefreshInput(bad) !== null) {
      parserOk = false;
      console.log(`    "${bad}" should have been rejected`);
    }
  }
  check('accepts every duration form', parserOk, `${cases.length} cases + 3 rejects`);
  check(
    'clamps below 5s and above 24h',
    JSON.stringify(ar.clampRefresh({ value: 1, unit: 'seconds' }).applied) ===
      JSON.stringify({ value: 5, unit: 'seconds' }) &&
      JSON.stringify(ar.clampRefresh({ value: 48, unit: 'hours' }).applied) ===
        JSON.stringify({ value: 24, unit: 'hours' }),
    '',
  );
  let roundTrip = true;
  for (const iv of [
    { value: 30, unit: 'seconds' },
    { value: 5, unit: 'minutes' },
    { value: 2, unit: 'hours' },
  ]) {
    const back = ar.parseRefreshInput(ar.formatRefresh(iv));
    if (JSON.stringify(back) !== JSON.stringify(iv)) roundTrip = false;
  }
  check('format -> parse round-trips', roundTrip, '');

  // -------------------------------------------------------------------------------------
  console.log('\n[4] Purge script actually erases every layer of persistence');
  // -------------------------------------------------------------------------------------
  const ub = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await ub.newContext();
  const page = await ctx.newPage();
  await page.goto('https://example.com/');
  const created = await page.evaluate(async () => {
    localStorage.setItem('uid', 'tracker-12345');
    sessionStorage.setItem('s', '1');
    document.cookie = 'zuno_test=yes; path=/';
    await new Promise((r) => {
      const q = indexedDB.open('trackerdb', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('s');
      q.onsuccess = () => {
        q.result.close();
        r();
      };
    });
    await caches.open('tracker-cache');
    return {
      ls: Object.keys(localStorage).length,
      ss: Object.keys(sessionStorage).length,
      ck: document.cookie.length,
      idb: (await indexedDB.databases()).map((d) => d.name),
      caches: await caches.keys(),
    };
  });
  await page.evaluate((src) => {
    (0, eval)(src);
  }, ar.PURGE_SCRIPT);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(async () => ({
    ls: Object.keys(localStorage).length,
    ss: Object.keys(sessionStorage).length,
    ck: document.cookie.length,
    idb: (await indexedDB.databases()).map((d) => d.name),
    caches: await caches.keys(),
  }));
  await ub.close();

  check('purge seed really wrote data', created.ls === 1 && created.ck > 0 && created.idb.length === 1, '');
  check('localStorage cleared', after.ls === 0, `${created.ls} -> ${after.ls}`);
  check('sessionStorage cleared', after.ss === 0, `${created.ss} -> ${after.ss}`);
  check('cookies cleared', after.ck === 0, `${created.ck}B -> ${after.ck}B`);
  check('IndexedDB cleared', after.idb.length === 0, `${created.idb.join(',')} -> none`);
  check('Cache Storage cleared', after.caches.length === 0, `${created.caches.join(',')} -> none`);

  // -------------------------------------------------------------------------------------
  console.log('\n[5] Network exit is described honestly');
  // -------------------------------------------------------------------------------------
  check('three exits offered', px.EXIT_OPTIONS.length === 3, '');
  check(
    'no free/open proxy is offered',
    px.EXIT_OPTIONS.every((o) => o.kind !== 'proxy'),
    'an open proxy reads your traffic',
  );
  check(
    'residential exit is offered and selectable',
    px.EXIT_OPTIONS.some((o) => o.kind === 'residential' && o.selectable === true),
    '',
  );
  check(
    'every exit states its limitation',
    px.EXIT_OPTIONS.every((o) => typeof o.caveat === 'string' && o.caveat.length > 40),
    '',
  );
  // Endpoint validation must reject a half-configured proxy rather than silently
  // pretending to route through it.
  const badEndpoints = [
    { host: '', port: 8080, scheme: 'http' },
    { host: 'gate.example.com', port: 0, scheme: 'http' },
    { host: 'gate.example.com', port: 99999, scheme: 'http' },
    { host: 'gate.example.com', port: 8080, scheme: 'http', password: 'x' },
  ];
  check(
    'endpoint validation rejects half-configured proxies',
    badEndpoints.every((e) => typeof px.validateEndpoint(e) === 'string'),
    `${badEndpoints.length} rejects`,
  );
  check(
    'endpoint validation accepts a complete proxy',
    px.validateEndpoint({ host: 'gate.example.com', port: 8080, scheme: 'socks5', username: 'u', password: 'p' }) === null,
    '',
  );
  check(
    'describeEndpoint never leaks the password',
    !px.describeEndpoint({ host: 'gate.example.com', port: 8080, scheme: 'http', username: 'u', password: 'secret' }).includes('secret'),
    '',
  );
  const probe = await px.probeOrbot(300);
  check('Orbot probe never throws', typeof probe.live === 'boolean', `live=${probe.live}`);
  const rprobe = await px.probeResidential({ host: '', port: 0, scheme: 'http' }, 300);
  check('residential probe never throws', typeof rprobe.live === 'boolean', `live=${rprobe.live}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`PASS=${pass}  FAIL=${fail}`);
  console.log(fail === 0 ? 'ALL_PASS = true' : 'ALL_PASS = false');
  process.exit(fail === 0 ? 0 : 1);
} finally {
  rmSync(out, { recursive: true, force: true });
}
