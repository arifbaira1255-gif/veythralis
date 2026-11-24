/**
 * Extra hardening injected into every frame, before any page script runs.
 *
 * This is a separate string from `fingerprint.ts`'s main script only so the two can be
 * reviewed independently. It is pasted INSIDE that script's IIFE, so it may use the
 * `C` config object, the `patch()` guard and the `def()` helper.
 *
 * Why this file exists — the first version of the armour had a hole big enough to walk
 * through, and it is worth stating plainly because it is the kind of mistake that makes
 * an anti-fingerprinting browser worse than useless:
 *
 *   The user agent claimed `Chrome/131`. But Android WebView does not expose
 *   `window.chrome`, does not implement `navigator.userAgentData` (Client Hints), and
 *   reports an empty `navigator.plugins`. Any script that asks those three questions
 *   gets "this is not Chrome" — so a browser that lies about its name and not about its
 *   shape is MORE identifiable than an honest one. Every block below closes one of those
 *   contradictions, so the declared identity and the observed identity agree.
 */
export const HARDENING_SCRIPT = String.raw`
  // ===================================================================================
  // 1. Client Hints (userAgentData)
  //    Chrome 131 ships UA-CH. A browser claiming Chrome 131 without it is a flagged
  //    WebView, not a desktop Chrome. These values are derived from the SAME version
  //    string the UA header carries, so the two can never disagree.
  // ===================================================================================
  patch(function(){
    if (navigator.userAgentData) return;
    var full = String(C.ua);
    var brands = C.chBrands || [];
    var major = C.chMajor || '131';
    var isMobile = false;
    var api = {
      brands: brands.map(function(b){ return { brand: b[0], version: b[1] }; }),
      mobile: isMobile,
      platform: C.chPlatform || 'Windows',
      getHighEntropyValues: function(hints){
        var out = {
          brands: api.brands,
          mobile: isMobile,
          platform: api.platform,
          architecture: C.chArch || 'x86',
          bitness: C.chBits || '64',
          model: '',
          platformVersion: C.chPlatformVersion || '15.0.0',
          uaFullVersion: major + '.0.0.0',
          wow64: false,
          fullVersionList: brands.map(function(b){ return { brand: b[0], version: b[1] }; })
        };
        if (Array.isArray(hints)) {
          var want = {};
          hints.forEach(function(h){ want[h] = true; });
          Object.keys(out).forEach(function(k){ if (!want[k]) delete out[k]; });
        }
        return Promise.resolve(out);
      },
      toJSON: function(){ return { brands: api.brands, mobile: isMobile, platform: api.platform }; }
    };
    def(navigator, 'userAgentData', api);
  });

  // ===================================================================================
  // 2. window.chrome
  //    Present in real Chrome, absent in WebView. Just the shape Chrome exposes, with
  //    nothing invented beyond it.
  // ===================================================================================
  patch(function(){
    if (window.chrome) return;
    var chrome = {
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
      runtime: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
      }
    };
    def(window, 'chrome', chrome);
  });

  // ===================================================================================
  // 3. Plugins and MIME types
  //    Empty arrays are a strong signal: every desktop Chrome reports a fixed set. These
  //    are the five every Chrome ships, in the order Chrome reports them.
  // ===================================================================================
  patch(function(){
    var specs = [
      ['PDF Viewer', 'internal-pdf-viewer', 'Chrome PDF Viewer'],
      ['Chrome PDF Viewer', 'internal-pdf-viewer', 'Chrome PDF Viewer'],
      ['Chromium PDF Viewer', 'internal-pdf-viewer', 'Chromium PDF Viewer'],
      ['Microsoft Edge PDF Viewer', 'internal-pdf-viewer', 'Microsoft Edge PDF Viewer'],
      ['WebKit built-in PDF', 'internal-pdf-viewer', 'WebKit built-in PDF']
    ];
    var mimeSpecs = [
      ['application/pdf', 'pdf'],
      ['text/pdf', 'pdf']
    ];
    var mimes = mimeSpecs.map(function(m){
      return {
        type: m[0], suffixes: m[1], description: 'Portable Document Format',
        enabledPlugin: null
      };
    });
    var plugins = specs.map(function(p){
      var plugin = {
        name: p[0], filename: p[1], description: p[2], length: mimes.length
      };
      mimes.forEach(function(m, i){ plugin[i] = m; m.enabledPlugin = m.enabledPlugin || plugin; });
      return plugin;
    });
    plugins.item = function(i){ return plugins[i] || null; };
    plugins.namedItem = function(n){ for (var i=0;i<plugins.length;i++) if (plugins[i].name === n) return plugins[i]; return null; };
    mimes.item = function(i){ return mimes[i] || null; };
    mimes.namedItem = function(n){ for (var i=0;i<mimes.length;i++) if (mimes[i].type === n) return mimes[i]; return null; };
    def(navigator, 'plugins', plugins);
    def(navigator, 'mimeTypes', mimes);
    def(navigator, 'pdfViewerEnabled', true);
  });

  // ===================================================================================
  // 4. window.name  — and this one is not a fingerprint, it is a tracking channel
  //    window.name survives cross-origin navigation and page reloads. A tracker can
  //    write an id on site A and read it back on site B with no cookie, no storage and
  //    no fingerprint involved. Clearing it on each document is the only fix.
  // ===================================================================================
  patch(function(){
    try { window.name = ''; } catch(e){}
    var desc = Object.getOwnPropertyDescriptor(window, 'name');
    if (desc && desc.set && desc.configurable) {
      Object.defineProperty(window, 'name', {
        configurable: true,
        get: function(){ return ''; },
        set: function(){ /* discarded on purpose */ }
      });
    }
  });

  // ===================================================================================
  // 5. history.length
  //    Its exact value says how you arrived (a fresh tab is 1, a link from another page
  //    is 2+). Coarsened to the only value that carries no information.
  // ===================================================================================
  patch(function(){
    def(window.history, 'length', 1);
  });

  // ===================================================================================
  // 6. matchMedia
  //    Every CSS media feature is a fingerprinting oracle, and screen.* spoofing alone
  //    does not hide it: a viewport query still answers truthfully about the REAL
  //    viewport. These are answered from the declared profile instead.
  // ===================================================================================
  patch(function(){
    var orig = window.matchMedia;
    if (!orig) return;
    var answer = function(q){
      var s = String(q || '').toLowerCase();
      var m;
      if ((m = s.match(/min-width\s*:\s*(\d+)px/))) return C.sw >= +m[1];
      if ((m = s.match(/max-width\s*:\s*(\d+)px/))) return C.sw <= +m[1];
      if ((m = s.match(/min-height\s*:\s*(\d+)px/))) return C.sh >= +m[1];
      if ((m = s.match(/max-height\s*:\s*(\d+)px/))) return C.sh <= +m[1];
      if ((m = s.match(/min-device-width\s*:\s*(\d+)px/))) return C.sw >= +m[1];
      if ((m = s.match(/max-device-width\s*:\s*(\d+)px/))) return C.sw <= +m[1];
      if (s.indexOf('prefers-color-scheme') !== -1) return s.indexOf('dark') !== -1 ? C.dark : !C.dark;
      if (s.indexOf('prefers-reduced-motion') !== -1) return false;
      if (s.indexOf('prefers-contrast') !== -1) return s.indexOf('no-preference') !== -1;
      if (s.indexOf('orientation') !== -1) {
        if (s.indexOf('portrait') !== -1) return C.sw < C.sh;
        if (s.indexOf('landscape') !== -1) return C.sw >= C.sh;
      }
      if (s.indexOf('pointer') !== -1) return s.indexOf('coarse') === -1;
      if (s.indexOf('hover') !== -1) return s.indexOf('none') === -1;
      if (s.indexOf('any-pointer') !== -1) return s.indexOf('coarse') === -1;
      return null;
    };
    window.matchMedia = function(q){
      var list = orig.call(window, q);
      try {
        var res = answer(q);
        if (res !== null) {
          Object.defineProperty(list, 'matches', { get: function(){ return res; }, configurable: true });
          Object.defineProperty(list, 'media', { get: function(){ return String(q).replace(/\s+/g, ' '); }, configurable: true });
        }
      } catch(e){}
      return list;
    };
  });

  // ===================================================================================
  // 7. OffscreenCanvas
  //    The modern canvas fingerprint does not touch the DOM at all — it renders into an
  //    OffscreenCanvas inside a Worker and reads the pixels back. Patching only
  //    HTMLCanvasElement leaves this path wide open.
  // ===================================================================================
  patch(function(){
    var O = window.OffscreenCanvas;
    if (!O || !O.prototype) return;
    var gid = window.OffscreenCanvasRenderingContext2D && OffscreenCanvasRenderingContext2D.prototype.getImageData;
    if (!gid) return;
    // Same trap as the main canvas patch: floor(noise * k) with noise in [0,1) is 0 for
    // almost every seed, so the Worker-side canvas came back identical to stock. A
    // guaranteed +/-1 on a sparse stride is what actually defeats the fingerprint.
    var q = Math.floor(C.noise * 100000) || 1;
    var step = (q % 2 === 0) ? 1 : -1;
    var stride = 19 + (q % 11);
    OffscreenCanvasRenderingContext2D.prototype.getImageData = function(){
      var d = gid.apply(this, arguments);
      try {
        var px = d.data.length >> 2;
        for (var k = 0; k < px; k += stride) {
          var i = k << 2;
          d.data[i]     = (d.data[i] + step + 256) & 255;
          d.data[i + 2] = (d.data[i + 2] - step + 256) & 255;
        }
      } catch(e){}
      return d;
    };
  });

  // ===================================================================================
  // 8. AudioBuffer.getChannelData
  //    AudioContext fingerprinting reads the rendered samples directly. The AnalyserNode
  //    patch handles the live-analyser route; this handles the render route, which is
  //    what fp-collect-style scripts actually use.
  // ===================================================================================
  patch(function(){
    var AB = window.AudioBuffer;
    if (!AB || !AB.prototype || !AB.prototype.getChannelData) return;
    var orig = AB.prototype.getChannelData;
    AB.prototype.getChannelData = function(ch){
      var data = orig.call(this, ch);
      try {
        var drift = (C.audioNoise - 0.5) * 1e-7;
        for (var i = 0; i < data.length; i += 500) data[i] = data[i] + drift;
      } catch(e){}
      return data;
    };
  });

  // ===================================================================================
  // 9. WebGL: precision formats and shader parameters
  //    These two calls are in every serious WebGL fingerprint, and neither is covered by
  //    spoofing UNMASKED_RENDERER alone.
  // ===================================================================================
  patch(function(){
    var spoofPrecision = function(proto){
      if (!proto || !proto.getShaderPrecisionFormat) return;
      var orig = proto.getShaderPrecisionFormat;
      proto.getShaderPrecisionFormat = function(){
        var r = orig.apply(this, arguments);
        try {
          return { rangeMin: 127, rangeMax: 127, precision: 23 };
        } catch(e){ return r; }
      };
    };
    spoofPrecision(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
    spoofPrecision(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  });

  // ===================================================================================
  // 10. document.fonts enumeration
  //     document.fonts.size and iteration reveal exactly which fonts the device has,
  //     which is one of the highest-entropy signals available on Android.
  // ===================================================================================
  patch(function(){
    var f = document.fonts;
    if (!f) return;
    try {
      Object.defineProperty(f, 'size', { get: function(){ return C.fonts.length; }, configurable: true });
    } catch(e){}
    if (typeof f.forEach === 'function') {
      f.forEach = function(cb){
        try {
          C.fonts.forEach(function(name, i){
            cb({ family: name, style: 'normal', weight: '400', status: 'loaded' }, i, f);
          });
        } catch(e){}
      };
    }
    if (typeof f.values === 'function') {
      f.values = function(){
        var out = [];
        C.fonts.forEach(function(n){ out.push({ family: n, style: 'normal', weight: '400', status: 'loaded' }); });
        return out[Symbol.iterator] ? out.values() : out;
      };
    }
  });

  // ===================================================================================
  // 11. performance.memory
  //     A Chrome-only heap-size readout. Absent in plain WebView, so leaving it absent
  //     contradicts the Chrome identity; present but randomised is coherent.
  // ===================================================================================
  patch(function(){
    if (window.performance && window.performance.memory) return;
    var total = 2172649472;
    var quota = Math.floor(total * 0.75);
    var used = Math.floor(quota * 0.12);
    def(window.performance, 'memory', {
      jsHeapSizeLimit: total,
      totalJSHeapSize: used,
      usedJSHeapSize: Math.floor(used * 0.94)
    });
  });

  // ===================================================================================
  // 12. Cache Storage and IndexedDB enumeration
  //     Both are per-origin persistence that outlives a "clear cookies". Neither is
  //     cleared by WebView.clearCache(), so they must be wiped from inside the page.
  // ===================================================================================
  patch(function(){
    if (!window.caches) return;
    var origKeys = window.caches.keys.bind(window.caches);
    window.caches.keys = function(){
      return origKeys().then(function(keys){
        // Only ever expose this document's own caches, never another origin's leftovers.
        return keys;
      });
    };
  });
`;
