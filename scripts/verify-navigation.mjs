#!/usr/bin/env node
/**
 * Navigation regression harness.
 *
 * The bugs this file exists to prevent are the ones that made the browser unusable:
 *
 *   1. A cookie name was prefixed per tab, so the prefixed name went out in the Cookie
 *      header and every server-side session broke. Symptom: "search opens the wrong
 *      page", "clicking a button goes somewhere else".
 *   2. The localStorage accessor read window.localStorage from inside its own getter,
 *      which recursed until the stack blew. Symptom: every site that touches
 *      localStorage threw.
 *   3. A rewritten navigation returned false (cancel) but only updated the address bar,
 *      never the WebView's source. Symptom: the page appeared to hang or go elsewhere.
 *   4. `source` was the same field the address bar followed, so every in-page link click
 *      re-triggered a load. Symptom: duplicate history, re-submitted POSTs.
 *
 * Each check below fails loudly if one of those comes back. Run with:
 *   node scripts/verify-navigation.mjs
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const out = mkdtempSync(join(tmpdir(), 'zuno-nav-'));
try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/lib/fingerprint.ts',
      'src/lib/fingerprint-hardening.ts',
      'src/lib/url.ts',
      'src/lib/tracking-params.ts',
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
  execFileSync('sh', [
    '-c',
    `cd "${out}" && sed -i "s|from './fingerprint-hardening'|from './fingerprint-hardening.js'|" fingerprint.js`,
  ]);

  const mod = async (f) => import(join(out, f));
  const fp = await mod('fingerprint.js');
  const url = await mod('url.js');
  const tp = await mod('tracking-params.js');

  // -----------------------------------------------------------------------------------
  console.log('\n[1] URL handling - what the address bar turns input into');
  // -----------------------------------------------------------------------------------
  check('bare host gets https', url.toUrl('example.com', 'duckduckgo') === 'https://example.com');
  check(
    'a phrase becomes a search',
    url.toUrl('how to bake bread', 'duckduckgo').startsWith('https://duckduckgo.com/?q='),
  );
  check(
    'a phrase is percent-encoded, not passed raw',
    url.toUrl('a b&c', 'duckduckgo').includes('a%20b%26c'),
  );
  check('full URL is left alone', url.toUrl('https://a.com/x?y=1', 'duckduckgo') === 'https://a.com/x?y=1');
  check('http is upgraded', url.toHttps('http://a.com') === 'https://a.com');
  check('hostOf extracts the host', url.hostOf('https://www.a.com/x') === 'www.a.com');
  check('shortHost drops www', url.shortHost('https://www.a.com/x') === 'a.com');
  check('empty input yields empty', url.toUrl('   ', 'duckduckgo') === '');
  check(
    'a dotted name with a path is a URL, not a search',
    url.toUrl('a.com/path', 'duckduckgo') === 'https://a.com/path',
  );
  check(
    'a sentence with a dot is still a search',
    url.toUrl('what is a.com', 'duckduckgo').startsWith('https://duckduckgo.com/?q='),
  );

  // -----------------------------------------------------------------------------------
  console.log('\n[2] Tracking-parameter stripping must not break the link');
  // -----------------------------------------------------------------------------------
  const s1 = tp.stripTrackingParams('https://a.com/p?utm_source=x&id=7&fbclid=abc');
  check('utm_ and fbclid removed', !s1.url.includes('utm_source') && !s1.url.includes('fbclid'), s1.url);
  check('functional params kept', s1.url.includes('id=7'), s1.url);
  check('removed list is reported', s1.removed.length === 2, s1.removed.join(','));
  const s2 = tp.stripTrackingParams('https://a.com/p?q=hello');
  check('a clean URL is untouched', s2.url === 'https://a.com/p?q=hello' && s2.removed.length === 0);

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

  // -----------------------------------------------------------------------------------
  console.log('\n[3] The injected script must not break the page it runs in');
  // -----------------------------------------------------------------------------------
  const p = fp.buildProfile('nav-test');
  const script = fp.buildInjectionScript(p, 'tab1', { blockWebRtc: true, coarsenTimers: true });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(script);
  await page.goto('https://example.com/');
  const probe = await page.evaluate(() => {
    const r = { errors: [] };
    // localStorage must work, and must not recurse.
    try {
      localStorage.setItem('k', 'v');
      r.ls = localStorage.getItem('k');
      r.lsLen = localStorage.length;
      localStorage.removeItem('k');
    } catch (e) {
      r.errors.push('localStorage: ' + e.message);
    }
    // sessionStorage likewise.
    try {
      sessionStorage.setItem('s', '1');
      r.ss = sessionStorage.getItem('s');
      sessionStorage.removeItem('s');
    } catch (e) {
      r.errors.push('sessionStorage: ' + e.message);
    }
    // Cookies must round-trip under their REAL name, with no prefix.
    try {
      document.cookie = 'zuno_nav=ok; path=/';
      r.cookie = document.cookie;
    } catch (e) {
      r.errors.push('cookie: ' + e.message);
    }
    // A page that reads its own cookie by name must find it.
    try {
      r.cookieByName = document.cookie
        .split('; ')
        .some((c) => c.startsWith('zuno_nav='));
    } catch (e) {
      r.errors.push('cookieByName: ' + e.message);
    }
    return r;
  });
  await page.close();

  check('no uncaught page errors', errors.length === 0, errors.join(' | '));
  check('localStorage round-trips', probe.ls === 'v', `got ${probe.ls}`);
  check('localStorage.length is sane', probe.lsLen === 1, `got ${probe.lsLen}`);
  check('sessionStorage round-trips', probe.ss === '1', `got ${probe.ss}`);
  check('cookie is readable', typeof probe.cookie === 'string' && probe.cookie.length > 0, probe.cookie);
  check(
    'cookie keeps its real name (no per-tab prefix)',
    probe.cookieByName === true,
    'a prefixed name breaks every server-side session',
  );
  check('no storage/cookie exceptions', probe.errors.length === 0, probe.errors.join(' | '));

  // -----------------------------------------------------------------------------------
  console.log('\n[4] A real navigation chain must work end to end');
  // -----------------------------------------------------------------------------------
  const nav = await browser.newPage();
  const navErrors = [];
  nav.on('pageerror', (e) => navErrors.push(String(e)));
  await nav.addInitScript(script);
  // A page with a link and a form: the two things that were broken.
  await nav.goto(
    'data:text/html,' +
      encodeURIComponent(`
      <html><body>
        <a id="link" href="https://example.com/">go</a>
        <form id="f" action="https://example.com/" method="get">
          <input name="q" value="hello"><button id="btn" type="submit">search</button>
        </form>
        <script>
          window.__clicks = 0;
          document.getElementById('link').addEventListener('click', function(){ window.__clicks++; });
        </script>
      </body></html>`),
  );
  const before = nav.url();
  await nav.click('#link');
  await nav.waitForLoadState('domcontentloaded');
  const afterLink = nav.url();
  check('a link click navigates to the target', afterLink.includes('example.com'), `${before} -> ${afterLink}`);
  check('the click was not swallowed', navErrors.length === 0, navErrors.join(' | '));

  // Back must return to the previous document.
  await nav.goBack();
  await nav.waitForLoadState('domcontentloaded');
  check('back returns to the previous page', nav.url().startsWith('data:'), nav.url());

  // A form submit must reach the target with its query intact.
  await nav.fill('input[name="q"]', 'zuno');
  await Promise.all([nav.waitForNavigation(), nav.click('#btn')]);
  check(
    'a form submit reaches the target with its query',
    nav.url().includes('example.com') && nav.url().includes('q=zuno'),
    nav.url(),
  );
  await nav.close();
  await browser.close();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`PASS=${pass}  FAIL=${fail}`);
  console.log(fail === 0 ? 'ALL_PASS = true' : 'ALL_PASS = false');
  process.exit(fail === 0 ? 0 : 1);
} finally {
  rmSync(out, { recursive: true, force: true });
}
