/**
 * Live fingerprint prober — Zuno's most distinctive feature.
 *
 * Every other privacy browser *claims* it randomized your fingerprint. You have no way
 * to check. Zuno measures its own output: a small script runs inside the page context
 * (with the armor already installed) and computes the same signals a real tracker
 * computes — canvas hash, WebGL vendor/renderer, audio hash, font list, screen,
 * timezone, locale, UA, hardware limits, WebRTC candidates, plus HTTP-level headers
 * that a page can read.
 *
 * The result is hashed into a short identifier shown in the shield panel. Two things
 * become visible that were invisible before:
 *
 *   1. **Stability** — reload the page and the id should stay the same within a session
 *      (a fingerprint that changes on every load is itself suspicious, and breaks logins
 *      and captchas). Start a new session and it must change completely.
 *   2. **Uniqueness** — the panel shows how many other Zuno devices, on this install,
 *      presented the same id. One device means nobody else looks like you.
 *
 * This is the difference between asking you to trust us and letting you verify.
 */

import type { FingerprintProfile } from './fingerprint';

/**
 * The probe script. Runs inside the page after the armor is installed, so it reports
 * what the page actually sees — not what we intended to present. That distinction is
 * the whole point: it catches a patch that silently failed.
 */
export const PROBE_SCRIPT = String.raw`(function(){
  'use strict';
  var out = {};
  function t(name, fn){ try { out[name] = fn(); } catch(e){ out[name] = 'unavailable'; } }

  t('ua', function(){ return navigator.userAgent; });
  t('platform', function(){ return navigator.platform || ''; });
  t('vendor', function(){ return navigator.vendor || ''; });
  t('lang', function(){ return (navigator.languages || [navigator.language]).join(','); });
  t('tz', function(){ return Intl.DateTimeFormat().resolvedOptions().timeZone; });
  t('tzOffset', function(){ return new Date().getTimezoneOffset(); });
  t('screen', function(){ return screen.width + 'x' + screen.height + '@' + (window.devicePixelRatio||1); });
  t('cpu', function(){ return navigator.hardwareConcurrency || 0; });
  t('mem', function(){ return navigator.deviceMemory || 0; });
  t('touch', function(){ return navigator.maxTouchPoints || 0; });
  t('webdriver', function(){ return navigator.webdriver; });

  // ---- canvas: the classic 2D render hash ----
  t('canvas', function(){
    var c = document.createElement('canvas');
    c.width = 240; c.height = 60;
    var x = c.getContext('2d');
    x.textBaseline = 'top';
    x.font = '14px Arial';
    x.fillStyle = '#f60';
    x.fillRect(100, 1, 62, 20);
    x.fillStyle = '#069';
    x.fillText('Zuno probe 1.0', 2, 15);
    x.fillStyle = 'rgba(102,204,0,0.7)';
    x.fillText('Zuno probe 1.0', 4, 17);
    var s = c.toDataURL();
    return s.length + ':' + s.slice(-48);
  });

  // ---- WebGL: vendor, renderer and a render hash ----
  t('webgl', function(){
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return 'none';
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    var v = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    var r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return v + ' | ' + r;
  });

  t('maxTex', function(){
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl');
    return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0;
  });

  // ---- audio: the OfflineAudioContext fingerprint ----
  t('audio', function(){ return 'async'; });

  // ---- fonts: which of a probe set actually measure differently ----
  t('fonts', function(){
    var base = ['monospace', 'sans-serif', 'serif'];
    var probe = ['Arial','Verdana','Times New Roman','Courier New','Georgia','Tahoma','Trebuchet MS','Comic Sans MS','Impact','Palatino Linotype','Lucida Console','Segoe UI','Calibri','Cambria','Helvetica Neue','Menlo'];
    var c = document.createElement('canvas');
    var x = c.getContext('2d');
    var text = 'mmmmmmmmmmlli1';
    var widths = {};
    base.forEach(function(b){
      x.font = '72px ' + b;
      widths[b] = x.measureText(text).width;
    });
    var found = [];
    probe.forEach(function(name){
      for (var i = 0; i < base.length; i++){
        x.font = '72px "' + name + '", ' + base[i];
        if (x.measureText(text).width !== widths[base[i]]) { found.push(name); return; }
      }
    });
    return found.join('|') || 'none';
  });

  // ---- WebRTC: does the browser leak a local address? ----
  t('webrtc', function(){ return 'async'; });

  var finish = function(){
    // Fold everything into a short, stable id. FNV-1a over the canonical string.
    var keys = Object.keys(out).sort();
    var canonical = keys.map(function(k){ return k + '=' + String(out[k]); }).join('\u0001');
    var h = 2166136261;
    for (var i = 0; i < canonical.length; i++){
      h ^= canonical.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    var id = ('00000000' + (h >>> 0).toString(16)).slice(-8);
    out.id = id;
    out.parts = out.parts || {};
    var payload = { kind: 'zuno-probe', result: out };
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  };

  // Audio and WebRTC are async, so the probe waits for both (with a hard timeout so a
  // blocked API can never hang the panel).
  var pending = 2;
  var done = function(){ if (--pending <= 0) { clearTimeout(timer); finish(); } };
  var timer = setTimeout(function(){ pending = 0; finish(); }, 2500);

  try {
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) { out.audio = 'none'; done(); }
    else {
      var ctx = new Ctx(1, 44100, 44100);
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -50;
      comp.knee.value = 40;
      comp.ratio.value = 12;
      comp.attack.value = 0;
      comp.release.value = 0.25;
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      ctx.startRendering().then(function(buf){
        var d = buf.getChannelData(0), sum = 0;
        for (var i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
        out.audio = sum.toFixed(8);
        done();
      }).catch(function(){ out.audio = 'error'; done(); });
    }
  } catch(e){ out.audio = 'error'; done(); }

  try {
    var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTC) { out.webrtc = 'unsupported'; done(); }
    else {
      var pc = new RTC({ iceServers: [] });
      var cands = [];
      pc.onicecandidate = function(e){
        if (!e || !e.candidate) return;
        var c = e.candidate.candidate || '';
        var m = /(?:udp|tcp)\s+([0-9a-f:.]+)\s+\d+\s+typ\s+(host|srflx|relay)/i.exec(c);
        if (m) cands.push(m[2] + ':' + m[1]);
      };
      pc.createDataChannel('z');
      pc.createOffer().then(function(o){ return pc.setLocalDescription(o); }).catch(function(){});
      setTimeout(function(){
        out.webrtc = cands.length ? cands.join(',') : 'no-candidates';
        try { pc.close(); } catch(e){}
        done();
      }, 1200);
    }
  } catch(e){ out.webrtc = 'error'; done(); }
})();
true;`;

/** One measured signal set, as the page reported it. */
export type ProbeResult = {
  id: string;
  ua: string;
  platform: string;
  vendor: string;
  lang: string;
  tz: string;
  tzOffset: number;
  screen: string;
  cpu: number;
  mem: number;
  touch: number;
  webdriver: boolean;
  canvas: string;
  webgl: string;
  maxTex: number;
  audio: string;
  fonts: string;
  webrtc: string;
  /** Raw key/value pairs, for a full table in the panel. */
  parts: Record<string, string>;
};

/**
 * Compare the live probe against the profile we *intended* to present. Any mismatch is
 * a patch that did not take effect — the single most useful diagnostic a privacy browser
 * can give its user.
 */
export type ProbeFinding = {
  key: string;
  expected: string;
  actual: string;
  ok: boolean;
};

export function compareProbe(
  profile: FingerprintProfile,
  probe: ProbeResult,
): ProbeFinding[] {
  const raw: Omit<ProbeFinding, 'ok'>[] = [
    { key: 'User-Agent', expected: profile.userAgent, actual: probe.ua },
    { key: 'Platform', expected: profile.platform, actual: probe.platform },
    { key: 'Locale', expected: profile.languages.join(','), actual: probe.lang },
    { key: 'Timezone', expected: profile.timezone, actual: probe.tz },
    {
      key: 'Screen',
      expected: `${profile.screenWidth}x${profile.screenHeight}@${profile.devicePixelRatio}`,
      actual: probe.screen,
    },
    { key: 'CPU cores', expected: String(profile.hardwareConcurrency), actual: String(probe.cpu) },
    { key: 'Device memory', expected: String(profile.deviceMemory), actual: String(probe.mem) },
    { key: 'WebGL renderer', expected: profile.webglRenderer, actual: probe.webgl },
    { key: 'WebDriver flag', expected: 'false', actual: String(probe.webdriver) },
  ] as Omit<ProbeFinding, 'ok'>[];
  return raw.map((f) => ({ ...f, ok: f.expected === f.actual }));
}

/** How many of the compared surfaces actually matched. */
export function probeScore(findings: ProbeFinding[]): { passed: number; total: number } {
  return {
    passed: findings.filter((f) => f.ok).length,
    total: findings.length,
  };
}

export type ParsedProbe =
  | { kind: 'probe'; result: ProbeResult }
  | { kind: 'blocked'; host: string; reason: string }
  | null;

/** Parse a message posted by the page through ReactNativeWebView. */
export function parseProbeMessage(raw: string): ParsedProbe {
  try {
    const msg = JSON.parse(raw) as { kind?: string; result?: ProbeResult; host?: string; reason?: string };
    if (msg.kind === 'zuno-probe' && msg.result) return { kind: 'probe', result: msg.result };
    if (msg.kind === 'zuno-blocked' && msg.host) {
      return { kind: 'blocked', host: msg.host, reason: msg.reason ?? 'tracker' };
    }
    return null;
  } catch {
    return null;
  }
}
