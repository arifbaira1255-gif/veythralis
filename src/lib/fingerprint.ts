/**
 * Veythralis per-session fingerprint engine.
 *
 * Every browsing session gets a fresh seed. From that seed we derive ONE coherent
 * device identity (a plausible machine, not a pile of contradictions) and inject a
 * script into every frame before any page script runs, so the page reports that
 * identity instead of the real one.
 *
 * Surfaces covered (this is the part that goes beyond what a normal browser does):
 *
 *   navigator   userAgent, appVersion, platform, language(s), hardwareConcurrency,
 *               deviceMemory, maxTouchPoints, webdriver, doNotTrack, plugins,
 *               mimeTypes, globalPrivacyControl, pdfViewerEnabled, vendor
 *   screen      width/height/avail*, colorDepth, pixelDepth, devicePixelRatio,
 *               orientation, window.outerWidth/outerHeight
 *   time        Intl resolvedOptions timeZone, Date.toLocale*, getTimezoneOffset
 *   canvas      2D readback noise (toDataURL, toBlob, getImageData)
 *   webgl       vendor/renderer + the numeric limits a real GPU reports
 *   audio       AudioContext / OfflineAudioContext sample noise (the classic
 *               "audio fingerprint" that most privacy tools forget)
 *   webrtc      RTCPeerConnection local-IP candidates suppressed (the classic
 *               VPN-bypass leak)
 *   fonts       document.fonts.check + measured text width jitter
 *   geometry    getBoundingClientRect sub-pixel jitter
 *   media       enumerateDevices returns a plausible device list
 *   battery     getBattery returns a stable fake
 *   network     connection.effectiveType / downlink / rtt
 *   storage     navigator.storage.estimate returns a plausible quota
 *   speech      speechSynthesis.getVoices returns a plausible voice list
 *   timing      performance.now() coarsened to defeat timer-based side channels
 *   cookies     document.cookie namespaced per tab, so two tabs on one origin
 *               cannot read each other's cookies
 *
 * Honest limit, stated in the app too: this raises the cost of cross-site
 * correlation a great deal. It is not a guarantee. TLS/JA3, IP address, and
 * server-side behaviour are outside what any in-page script can change.
 */

export type FingerprintProfile = {
  seed: string;
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: string[];
  timezone: string;
  timezoneOffset: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  webglVendor: string;
  webglRenderer: string;
  maxTextureSize: number;
  canvasNoise: number;
  audioNoise: number;
  geometryNoise: number;
  fonts: string[];
  touchPoints: number;
  storageQuotaGb: number;
  batteryLevel: number;
  batteryCharging: boolean;
  connectionType: string;
  connectionDownlink: number;
  connectionRtt: number;
  voices: string[];
  mediaDevices: { kind: string; label: string }[];
};

/** Small deterministic PRNG (mulberry32) so one seed yields one coherent profile. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length];
}

const SCREENS: readonly [number, number][] = [
  [1920, 1080],
  [1536, 864],
  [1440, 900],
  [1366, 768],
  [1600, 900],
  [2560, 1440],
  [1280, 800],
  [1680, 1050],
];

const TIMEZONES: readonly { tz: string; offset: number }[] = [
  { tz: 'Europe/London', offset: 0 },
  { tz: 'Europe/Berlin', offset: -60 },
  { tz: 'Europe/Amsterdam', offset: -60 },
  { tz: 'America/New_York', offset: 300 },
  { tz: 'America/Chicago', offset: 360 },
  { tz: 'America/Los_Angeles', offset: 480 },
  { tz: 'Asia/Singapore', offset: -480 },
  { tz: 'Australia/Sydney', offset: -600 },
];

const LOCALES: readonly { language: string; languages: string[] }[] = [
  { language: 'en-GB', languages: ['en-GB', 'en'] },
  { language: 'en-US', languages: ['en-US', 'en'] },
  { language: 'de-DE', languages: ['de-DE', 'de', 'en'] },
  { language: 'fr-FR', languages: ['fr-FR', 'fr', 'en'] },
  { language: 'nl-NL', languages: ['nl-NL', 'nl', 'en'] },
  { language: 'es-ES', languages: ['es-ES', 'es', 'en'] },
];

const GPUS: readonly { vendor: string; renderer: string; maxTex: number }[] = [
  {
    vendor: 'Google Inc. (NVIDIA)',
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTex: 16384,
  },
  {
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTex: 16384,
  },
  {
    vendor: 'Google Inc. (AMD)',
    renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTex: 16384,
  },
  {
    vendor: 'Google Inc. (Apple)',
    renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
    maxTex: 16384,
  },
  {
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTex: 16384,
  },
];

const FONT_POOL: readonly string[] = [
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Console',
  'Palatino Linotype',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
];

const UA_POOL: readonly { ua: string; platform: string; vendor: string }[] = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    vendor: 'Google Inc.',
  },
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
  },
];

const VOICE_POOL: readonly string[] = [
  'Google UK English Female',
  'Google UK English Male',
  'Google US English',
  'Microsoft David - English (United States)',
  'Microsoft Zira - English (United States)',
  'Daniel',
  'Samantha',
];

const MEDIA_POOL: readonly { kind: string; label: string }[] = [
  { kind: 'audioinput', label: 'Default - Microphone (Realtek(R) Audio)' },
  { kind: 'audiooutput', label: 'Default - Speakers (Realtek(R) Audio)' },
  { kind: 'videoinput', label: 'HD Webcam (04f2:b6d9)' },
];

/** Build one coherent randomized profile from a session seed. */
export function buildProfile(seed: string): FingerprintProfile {
  const r = rng(seed);
  const screen = pick(r, SCREENS);
  const locale = pick(r, LOCALES);
  const gpu = pick(r, GPUS);
  const ua = pick(r, UA_POOL);
  const tz = pick(r, TIMEZONES);
  // A stable-looking but random subset of fonts, always including the core three.
  const fonts = FONT_POOL.filter(
    (f) => ['Arial', 'Times New Roman', 'Courier New'].includes(f) || r() > 0.45,
  );
  const voiceCount = 2 + Math.floor(r() * 3);
  const voices = VOICE_POOL.slice(0, voiceCount);
  return {
    seed,
    userAgent: ua.ua,
    platform: ua.platform,
    vendor: ua.vendor,
    language: locale.language,
    languages: locale.languages,
    timezone: tz.tz,
    timezoneOffset: tz.offset,
    screenWidth: screen[0],
    screenHeight: screen[1],
    colorDepth: pick(r, [24, 24, 24, 30]),
    devicePixelRatio: pick(r, [1, 1, 1.25, 1.5, 2]),
    hardwareConcurrency: pick(r, [4, 8, 8, 12, 16]),
    deviceMemory: pick(r, [4, 8, 8, 16]),
    webglVendor: gpu.vendor,
    webglRenderer: gpu.renderer,
    maxTextureSize: gpu.maxTex,
    canvasNoise: Math.floor(r() * 100000) / 100000,
    audioNoise: Math.floor(r() * 100000) / 100000,
    geometryNoise: Math.floor(r() * 1000) / 100000,
    fonts,
    touchPoints: pick(r, [0, 0, 0, 5, 10]),
    storageQuotaGb: pick(r, [40, 60, 80, 120, 250]),
    batteryLevel: Math.round((0.35 + r() * 0.6) * 100) / 100,
    batteryCharging: r() > 0.5,
    connectionType: pick(r, ['4g', '4g', 'wifi']),
    connectionDownlink: Math.round((5 + r() * 15) * 10) / 10,
    connectionRtt: pick(r, [50, 75, 100, 150]),
    voices,
    mediaDevices: MEDIA_POOL.slice(0, 1 + Math.floor(r() * 3)),
  };
}

/** A fresh random seed for a new session. */
export function newSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The script injected before any page content loads. It must be self-contained: no
 * imports, no references to app state, and it must never throw (a throw would leave the
 * page half-patched), so every patch is wrapped in its own try/catch.
 */
export function buildInjectionScript(
  profile: FingerprintProfile,
  tabId: string,
  opts: { blockWebRtc?: boolean; coarsenTimers?: boolean } = {},
): string {
  const cfg = JSON.stringify({
    ua: profile.userAgent,
    platform: profile.platform,
    vendor: profile.vendor,
    language: profile.language,
    languages: profile.languages,
    timezone: profile.timezone,
    tzOffset: profile.timezoneOffset,
    sw: profile.screenWidth,
    sh: profile.screenHeight,
    cd: profile.colorDepth,
    dpr: profile.devicePixelRatio,
    hc: profile.hardwareConcurrency,
    dm: profile.deviceMemory,
    glVendor: profile.webglVendor,
    glRenderer: profile.webglRenderer,
    maxTex: profile.maxTextureSize,
    noise: profile.canvasNoise,
    audioNoise: profile.audioNoise,
    geoNoise: profile.geometryNoise,
    fonts: profile.fonts,
    touch: profile.touchPoints,
    quota: profile.storageQuotaGb,
    battLevel: profile.batteryLevel,
    battCharging: profile.batteryCharging,
    connType: profile.connectionType,
    connDown: profile.connectionDownlink,
    connRtt: profile.connectionRtt,
    voices: profile.voices,
    media: profile.mediaDevices,
    tab: tabId,
    webrtc: opts.blockWebRtc !== false,
    timers: opts.coarsenTimers !== false,
  });

  return `(function(){
  'use strict';
  var C = ${cfg};
  var def = function(o, k, v){ try { Object.defineProperty(o, k, { get: function(){ return v; }, configurable: true }); } catch(e){} };
  var patch = function(fn){ try { fn(); } catch(e){} };

  // ---- navigator ----
  patch(function(){
    def(navigator, 'userAgent', C.ua);
    def(navigator, 'appVersion', C.ua.replace('Mozilla/', ''));
    def(navigator, 'appName', 'Netscape');
    def(navigator, 'platform', C.platform);
    def(navigator, 'vendor', C.vendor);
    def(navigator, 'language', C.language);
    def(navigator, 'languages', Object.freeze(C.languages.slice()));
    def(navigator, 'hardwareConcurrency', C.hc);
    def(navigator, 'deviceMemory', C.dm);
    def(navigator, 'webdriver', false);
    def(navigator, 'doNotTrack', '1');
    def(navigator, 'globalPrivacyControl', true);
    def(navigator, 'maxTouchPoints', C.touch);
    def(navigator, 'pdfViewerEnabled', true);
    def(navigator, 'plugins', Object.freeze([]));
    def(navigator, 'mimeTypes', Object.freeze([]));
  });

  // ---- screen ----
  patch(function(){
    def(screen, 'width', C.sw);
    def(screen, 'height', C.sh);
    def(screen, 'availWidth', C.sw);
    def(screen, 'availHeight', C.sh - 40);
    def(screen, 'colorDepth', C.cd);
    def(screen, 'pixelDepth', C.cd);
    def(window, 'devicePixelRatio', C.dpr);
    def(window, 'outerWidth', C.sw);
    def(window, 'outerHeight', C.sh - 80);
    def(window, 'innerWidth', C.sw - 16);
    def(window, 'innerHeight', C.sh - 120);
    try {
      if (screen.orientation) {
        def(screen.orientation, 'type', 'landscape-primary');
        def(screen.orientation, 'angle', 0);
      }
    } catch(e){}
  });

  // ---- timezone: Intl + Date, including getTimezoneOffset ----
  patch(function(){
    var tz = C.timezone;
    var orig = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function(){
      var o = orig.call(this);
      o.timeZone = tz;
      return o;
    };
    var dtf = Date.prototype.toLocaleString;
    Date.prototype.toLocaleString = function(l, o){
      o = o || {}; o.timeZone = tz;
      return dtf.call(this, l, o);
    };
    var dtd = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function(l, o){
      o = o || {}; o.timeZone = tz;
      return dtd.call(this, l, o);
    };
    var dtt = Date.prototype.toLocaleTimeString;
    Date.prototype.toLocaleTimeString = function(l, o){
      o = o || {}; o.timeZone = tz;
      return dtt.call(this, l, o);
    };
    Date.prototype.getTimezoneOffset = function(){ return C.tzOffset; };
  });

  // ---- canvas: sub-pixel noise so the hash differs per session ----
  patch(function(){
    var toDataURL = HTMLCanvasElement.prototype.toDataURL;
    var toBlob = HTMLCanvasElement.prototype.toBlob;
    var getImageData = CanvasRenderingContext2D.prototype.getImageData;
    var nudge = function(canvas){
      try {
        var ctx = canvas.getContext('2d');
        if (!ctx || !canvas.width || !canvas.height) return;
        var w = Math.min(canvas.width, 64), h = Math.min(canvas.height, 64);
        var d = getImageData.call(ctx, 0, 0, w, h);
        for (var i = 0; i < d.data.length; i += 4) {
          d.data[i] = (d.data[i] + Math.floor(C.noise * 7)) % 256;
          d.data[i + 1] = (d.data[i + 1] + Math.floor(C.noise * 3)) % 256;
        }
        ctx.putImageData(d, 0, 0);
      } catch(e){}
    };
    HTMLCanvasElement.prototype.toDataURL = function(){
      nudge(this);
      return toDataURL.apply(this, arguments);
    };
    HTMLCanvasElement.prototype.toBlob = function(){
      nudge(this);
      return toBlob.apply(this, arguments);
    };
    CanvasRenderingContext2D.prototype.getImageData = function(){
      var d = getImageData.apply(this, arguments);
      try {
        for (var i = 0; i < d.data.length; i += 4) {
          d.data[i] = (d.data[i] + Math.floor(C.noise * 5)) % 256;
        }
      } catch(e){}
      return d;
    };
  });

  // ---- WebGL: vendor, renderer and the numeric limits a real GPU reports ----
  patch(function(){
    var spoof = function(proto){
      if (!proto) return;
      var gp = proto.getParameter;
      proto.getParameter = function(p){
        if (p === 37445) return C.glVendor;   // UNMASKED_VENDOR_WEBGL
        if (p === 37446) return C.glRenderer; // UNMASKED_RENDERER_WEBGL
        if (p === 3379) return C.maxTex;      // MAX_TEXTURE_SIZE
        if (p === 34076) return C.maxTex;     // MAX_CUBE_MAP_TEXTURE_SIZE
        if (p === 34921) return 16;           // MAX_VERTEX_ATTRIBS
        if (p === 36347) return 1024;         // MAX_VERTEX_UNIFORM_VECTORS
        if (p === 36348) return 30;           // MAX_VARYING_VECTORS
        if (p === 36349) return 1024;         // MAX_FRAGMENT_UNIFORM_VECTORS
        return gp.call(this, p);
      };
      var gsp = proto.getSupportedExtensions;
      if (gsp) {
        proto.getSupportedExtensions = function(){
          var list = gsp.call(this) || [];
          // Drop the debug-renderer-info extension: it is a fingerprinting shortcut.
          return list.filter(function(n){ return n !== 'WEBGL_debug_renderer_info'; });
        };
      }
    };
    spoof(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
    spoof(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  });

  // ---- audio: the classic audio fingerprint, which most tools forget ----
  patch(function(){
    var nudge = function(buf){
      try {
        if (!buf || !buf.length) return buf;
        for (var i = 0; i < buf.length; i += 100) {
          buf[i] = buf[i] + (C.audioNoise - 0.5) * 1e-7;
        }
      } catch(e){}
      return buf;
    };
    var wrapAnalyser = function(proto){
      if (!proto) return;
      var gfd = proto.getFloatFrequencyData;
      if (gfd) {
        proto.getFloatFrequencyData = function(arr){
          var r = gfd.call(this, arr);
          nudge(arr);
          return r;
        };
      }
      var gbd = proto.getByteFrequencyData;
      if (gbd) {
        proto.getByteFrequencyData = function(arr){
          var r = gbd.call(this, arr);
          try {
            for (var i = 0; i < arr.length; i += 50) {
              arr[i] = (arr[i] + Math.floor(C.audioNoise * 3)) % 256;
            }
          } catch(e){}
          return r;
        };
      }
    };
    wrapAnalyser(window.AnalyserNode && AnalyserNode.prototype);
    // OfflineAudioContext is the usual fingerprinting path: it renders deterministically.
    var wrapOffline = function(Ctor){
      if (!Ctor) return;
      var startRendering = Ctor.prototype.startRendering;
      if (!startRendering) return;
      Ctor.prototype.startRendering = function(){
        return startRendering.call(this).then(function(buffer){
          try {
            for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
              nudge(buffer.getChannelData(ch));
            }
          } catch(e){}
          return buffer;
        });
      };
    };
    wrapOffline(window.OfflineAudioContext);
    wrapOffline(window.webkitOfflineAudioContext);
  });

  // ---- WebRTC: suppress local-IP candidates (the classic VPN-bypass leak) ----
  if (C.webrtc) patch(function(){
    var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTC) return;
    var scrub = function(sdp){
      try {
        return String(sdp || '')
          .split('\\r\\n')
          .filter(function(line){
            return line.indexOf('a=candidate:') !== 0 ||
              (line.indexOf(' typ host') === -1 && line.indexOf(' typ srflx') === -1);
          })
          .join('\\r\\n');
      } catch(e){ return sdp; }
    };
    var origSetLocal = RTC.prototype.setLocalDescription;
    if (origSetLocal) {
      RTC.prototype.setLocalDescription = function(desc){
        try {
          if (desc && desc.sdp) desc = { type: desc.type, sdp: scrub(desc.sdp) };
        } catch(e){}
        return origSetLocal.call(this, desc);
      };
    }
    var origCreateOffer = RTC.prototype.createOffer;
    if (origCreateOffer) {
      RTC.prototype.createOffer = function(){
        return origCreateOffer.apply(this, arguments).then(function(desc){
          try { if (desc && desc.sdp) desc.sdp = scrub(desc.sdp); } catch(e){}
          return desc;
        });
      };
    }
  });

  // ---- fonts: report only the randomized set, and jitter measured widths ----
  patch(function(){
    var real = document.fonts;
    if (real) {
      var has = real.check.bind(real);
      real.check = function(font, text){
        var name = String(font || '').replace(/["']/g, '').split(' ')[0];
        if (C.fonts.indexOf(name) === -1) return false;
        return has(font, text);
      };
    }
    // Text-width measurement is the other half of font fingerprinting.
    var measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function(text){
      var m = measure.call(this, text);
      try {
        var w = m.width;
        Object.defineProperty(m, 'width', {
          get: function(){ return w + C.geoNoise * 10; },
          configurable: true,
        });
      } catch(e){}
      return m;
    };
  });

  // ---- geometry: sub-pixel jitter on element rects ----
  patch(function(){
    var gbcr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function(){
      var r = gbcr.call(this);
      try {
        var j = C.geoNoise;
        return {
          x: r.x + j, y: r.y + j,
          width: r.width + j, height: r.height + j,
          top: r.top + j, left: r.left + j,
          right: r.right + j, bottom: r.bottom + j,
          toJSON: function(){ return this; },
        };
      } catch(e){ return r; }
    };
  });

  // ---- media devices: a plausible list instead of the real hardware ----
  patch(function(){
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices = function(){
      return Promise.resolve(C.media.map(function(d, i){
        return {
          deviceId: 'vth-' + C.tab + '-' + i,
          groupId: 'vth-g-' + i,
          kind: d.kind,
          label: d.label,
        };
      }));
    };
  });

  // ---- battery ----
  patch(function(){
    if (!navigator.getBattery) return;
    navigator.getBattery = function(){
      return Promise.resolve({
        charging: C.battCharging,
        chargingTime: C.battCharging ? 0 : Infinity,
        dischargingTime: C.battCharging ? Infinity : 14400,
        level: C.battLevel,
        onchargingchange: null,
        onchargingtimechange: null,
        ondischargingtimechange: null,
        onlevelchange: null,
        addEventListener: function(){},
        removeEventListener: function(){},
        dispatchEvent: function(){ return true; },
      });
    };
  });

  // ---- network information ----
  patch(function(){
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return;
    def(conn, 'effectiveType', C.connType);
    def(conn, 'type', C.connType === 'wifi' ? 'wifi' : 'cellular');
    def(conn, 'downlink', C.connDown);
    def(conn, 'rtt', C.connRtt);
    def(conn, 'saveData', false);
  });

  // ---- storage quota ----
  patch(function(){
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate = function(){
      var quota = C.quota * 1024 * 1024 * 1024;
      return Promise.resolve({ quota: quota, usage: Math.floor(quota * 0.02) });
    };
  });

  // ---- speech synthesis voices ----
  patch(function(){
    if (!window.speechSynthesis) return;
    var voices = C.voices.map(function(name, i){
      return {
        name: name,
        lang: C.language,
        localService: i % 2 === 0,
        default: i === 0,
        voiceURI: name,
      };
    });
    window.speechSynthesis.getVoices = function(){ return voices; };
  });

  // ---- timing: coarsen performance.now() to defeat timer side channels ----
  if (C.timers) patch(function(){
    var origNow = performance.now.bind(performance);
    var bucket = 100; // 100 microseconds
    performance.now = function(){
      return Math.floor(origNow() * 10 / bucket) * (bucket / 10);
    };
  });

  // ---- permissions: do not reveal the real permission state ----
  patch(function(){
    if (!navigator.permissions || !navigator.permissions.query) return;
    var origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(desc){
      try {
        if (desc && (desc.name === 'notifications' || desc.name === 'geolocation')) {
          return Promise.resolve({ state: 'prompt', onchange: null });
        }
      } catch(e){}
      return origQuery(desc);
    };
  });

  // ---- per-tab cookie isolation ----
  // document.cookie is namespaced per tab, so two tabs on the same origin cannot read
  // each other's cookies. The prefix is stripped on read, so the page sees its own
  // cookies exactly as it wrote them.
  patch(function(){
    var prefix = '__vth_' + C.tab + '__';
    var desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (!desc || !desc.get || !desc.set) return;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: function(){
        var raw = desc.get.call(document) || '';
        if (!raw) return '';
        return raw
          .split('; ')
          .filter(function(pair){ return pair.indexOf(prefix) === 0; })
          .map(function(pair){ return pair.slice(prefix.length); })
          .join('; ');
      },
      set: function(v){
        var str = String(v || '');
        var semi = str.indexOf(';');
        var head = semi === -1 ? str : str.slice(0, semi);
        var tail = semi === -1 ? '' : str.slice(semi);
        desc.set.call(document, prefix + head + tail);
      },
    });
  });

  // ---- per-tab storage isolation ----
  // Each tab gets its own namespace inside localStorage/sessionStorage, so two tabs on
  // the same origin cannot read each other's data. IndexedDB database names are
  // prefixed for the same reason.
  patch(function(){
    var prefix = '__vth_' + C.tab + '__';
    var wrap = function(store){
      if (!store) return store;
      var key = function(k){ return prefix + k; };
      var api = {
        getItem: function(k){ return store.getItem(key(k)); },
        setItem: function(k, v){ return store.setItem(key(k), v); },
        removeItem: function(k){ return store.removeItem(key(k)); },
        clear: function(){
          var doomed = [];
          for (var i = 0; i < store.length; i++) {
            var kk = store.key(i);
            if (kk && kk.indexOf(prefix) === 0) doomed.push(kk);
          }
          doomed.forEach(function(kk){ store.removeItem(kk); });
        },
        key: function(i){
          var names = [];
          for (var j = 0; j < store.length; j++) {
            var kk = store.key(j);
            if (kk && kk.indexOf(prefix) === 0) names.push(kk.slice(prefix.length));
          }
          return names[i] || null;
        }
      };
      Object.defineProperty(api, 'length', {
        get: function(){
          var n = 0;
          for (var j = 0; j < store.length; j++) {
            var kk = store.key(j);
            if (kk && kk.indexOf(prefix) === 0) n++;
          }
          return n;
        }
      });
      return api;
    };
    try { Object.defineProperty(window, 'localStorage', { get: function(){ return wrap(window.__vth_ls || (window.__vth_ls = window.localStorage)); }, configurable: true }); } catch(e){}
    try { Object.defineProperty(window, 'sessionStorage', { get: function(){ return wrap(window.__vth_ss || (window.__vth_ss = window.sessionStorage)); }, configurable: true }); } catch(e){}
    try {
      if (window.indexedDB && window.indexedDB.open) {
        var open = window.indexedDB.open.bind(window.indexedDB);
        window.indexedDB.open = function(name){
          var args = Array.prototype.slice.call(arguments);
          args[0] = prefix + name;
          return open.apply(window.indexedDB, args);
        };
      }
    } catch(e){}
  });

  // ---- referrer policy ----
  patch(function(){
    var d = document.createElement('meta');
    d.name = 'referrer';
    d.content = 'no-referrer';
    (document.head || document.documentElement).appendChild(d);
  });
})();`;
}
