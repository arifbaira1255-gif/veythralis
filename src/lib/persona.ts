/**
 * Persona engine - the part that makes Zuno behave differently from every other
 * "randomize my fingerprint" browser.
 *
 * The problem nobody talks about: **naive randomization makes you more identifiable,
 * not less.** If 30% of the web runs Chrome on Windows at 1920x1080 with 8 cores, and
 * you show up as 1536x864 with 12 cores on an emulated GTX 1660, you are a cohort of
 * one. You have replaced a common fingerprint with a unique one, which is exactly the
 * opposite of what you wanted.
 *
 * Zuno therefore offers two independent strategies:
 *
 *   BLEND  - draw from the *most populated* device cohorts, so the persona you present
 *            is shared by millions of other devices. This is the Tor Browser strategy:
 *            uniformity beats false uniqueness. It is the default.
 *
 *   ROTATE - draw from a wide space so a returning tracker cannot link two sessions.
 *            Stronger against long-term correlation, weaker against per-session
 *            uniqueness. For when you care about being unlinkable more than blending in.
 *
 * ---------------------------------------------------------------------------------------
 * WINDOWS ONLY, AND THAT IS A DELIBERATE CHOICE
 * ---------------------------------------------------------------------------------------
 * Every persona this engine produces is a **Windows desktop**. Never a phone, never a
 * Mac, never Linux. Two reasons, and the second is the important one:
 *
 *   1. Windows is the single largest desktop cohort on the web, so a Windows persona is
 *      the least unusual thing you can be.
 *
 *   2. A phone-shaped fingerprint is a *contradiction* on this device. Zuno runs inside
 *      an Android WebView, and the WebView's own engine reports Android-shaped values
 *      for a long tail of surfaces that no in-page script can reach (TLS/JA3, the
 *      Sec-CH-UA-Platform the network stack sends, the touch/pointer model, the
 *      viewport behaviour). Claiming to be an iPhone while the transport says Android is
 *      a stronger signal than any single attribute - it is a fingerprint that says
 *      "this is a spoofed browser", which is the worst possible answer. Presenting a
 *      Windows desktop is the one identity whose *declared* surfaces we can make
 *      internally consistent, and consistency is what actually defeats fingerprinting.
 *
 * The honest limit, stated in the app too: the transport layer still says Android. This
 * engine makes the *page-visible* identity a coherent Windows machine; it cannot change
 * what the TLS handshake reveals. That is a native-layer problem, not a script problem.
 *
 * Personas are also **geo-coherent**: the timezone and locale are always United States,
 * and they rotate on every refresh, so a returning visit is a different US machine in a
 * different US timezone. A US timezone with a German locale would be a contradiction, so
 * the locale table is US-only for the same reason the platform table is Windows-only.
 */

import type { FingerprintProfile } from './fingerprint';

export type PersonaMode = 'blend' | 'rotate';

export const PERSONA_MODE_LABEL: Record<PersonaMode, { title: string; detail: string }> = {
  blend: {
    title: 'Blend into the crowd',
    detail:
      'Present the most common Windows desktop profile on the web, so you look like millions of other people instead of a unique machine.',
  },
  rotate: {
    title: 'Rotate identity',
    detail:
      'Draw a different Windows machine from a wide space each session, so a tracker cannot link two visits to the same device.',
  },
};

/**
 * The most populated Windows desktop cohorts. Percentages are rough shares of the
 * Windows desktop web; the engine weights towards the top so a blended persona lands in
 * a large crowd.
 *
 * chPlatformVersion is what Chrome actually reports through User-Agent Client Hints for
 * that Windows release - Windows 10 reports 10.0.0, Windows 11 reports 15.0.0. These are
 * kept in the table rather than derived, because the mapping is not arithmetic and a
 * wrong guess here is exactly the kind of contradiction this file exists to avoid.
 */
export const COHORT_PROFILES: readonly {
  weight: number;
  winVersion: string;
  platform: string;
  vendor: string;
  screen: readonly [number, number];
  colorDepth: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  webglVendor: string;
  webglRenderer: string;
  maxTextureSize: number;
  chPlatformVersion: string;
}[] = [
  {
    weight: 22,
    winVersion: 'Windows 11',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1920, 1080],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '15.0.0',
  },
  {
    weight: 16,
    winVersion: 'Windows 10',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1920, 1080],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '10.0.0',
  },
  {
    weight: 14,
    winVersion: 'Windows 11',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1536, 864],
    colorDepth: 24,
    devicePixelRatio: 1.25,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '15.0.0',
  },
  {
    weight: 12,
    winVersion: 'Windows 10',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1366, 768],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 4,
    deviceMemory: 4,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 8192,
    chPlatformVersion: '10.0.0',
  },
  {
    weight: 10,
    winVersion: 'Windows 11',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [2560, 1440],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 12,
    deviceMemory: 16,
    webglVendor: 'Google Inc. (AMD)',
    webglRenderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '15.0.0',
  },
  {
    weight: 9,
    winVersion: 'Windows 10',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1600, 900],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 4,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '10.0.0',
  },
  {
    weight: 8,
    winVersion: 'Windows 11',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1920, 1080],
    colorDepth: 24,
    devicePixelRatio: 1.25,
    hardwareConcurrency: 16,
    deviceMemory: 16,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '15.0.0',
  },
  {
    weight: 5,
    winVersion: 'Windows 10',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [1280, 720],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 2,
    deviceMemory: 4,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) HD Graphics 3000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 8192,
    chPlatformVersion: '10.0.0',
  },
  {
    weight: 4,
    winVersion: 'Windows 11',
    platform: 'Win32',
    vendor: 'Google Inc.',
    screen: [3840, 2160],
    colorDepth: 24,
    devicePixelRatio: 1.5,
    hardwareConcurrency: 16,
    deviceMemory: 32,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    maxTextureSize: 16384,
    chPlatformVersion: '15.0.0',
  },
];

/**
 * Region table. United States only, on purpose - see the file header. A national TLD
 * outside the US does not get a foreign timezone here, because a US-locked persona that
 * suddenly claims Asia/Tokyo is the contradiction we are trying to remove. The table
 * exists so alignToHost can recognise a US site and keep the persona coherent with it.
 */
export const REGIONS: readonly {
  tlds: readonly string[];
  timezone: string;
  timezoneOffset: number;
  language: string;
  languages: readonly string[];
}[] = [
  {
    tlds: ['.us', '.gov', '.mil', '.edu', '.com', '.org', '.net', '.io', '.co'],
    timezone: 'America/New_York',
    timezoneOffset: 300,
    language: 'en-US',
    languages: ['en-US', 'en'],
  },
];

/** Weighted pick over the cohort table using a supplied uniform random source. */
function weightedCohort(r: () => number): (typeof COHORT_PROFILES)[number] {
  const total = COHORT_PROFILES.reduce((sum, c) => sum + c.weight, 0);
  let target = r() * total;
  for (const cohort of COHORT_PROFILES) {
    target -= cohort.weight;
    if (target <= 0) return cohort;
  }
  return COHORT_PROFILES[0];
}

/**
 * Overlay a persona over a base fingerprint profile. `blend` snaps the hardware surfaces
 * to a real, populated Windows cohort; `rotate` leaves the wider random draw in place.
 * Either way the identity surfaces (canvas/audio noise, fonts, voices) stay tied to the
 * seed so the session remains internally consistent.
 *
 * The Windows version is drawn from the cohort, so a refresh can land on Windows 10 or
 * Windows 11 - a different machine each time, never a phone.
 */
export function applyPersona(
  base: FingerprintProfile,
  mode: PersonaMode,
  seed: string,
): FingerprintProfile {
  if (mode === 'rotate') return base;

  // Deterministic from the seed, so a session does not flicker between cohorts.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };

  const cohort = weightedCohort(r);
  return {
    ...base,
    platform: cohort.platform,
    vendor: cohort.vendor,
    screenWidth: cohort.screen[0],
    screenHeight: cohort.screen[1],
    colorDepth: cohort.colorDepth,
    devicePixelRatio: cohort.devicePixelRatio,
    hardwareConcurrency: cohort.hardwareConcurrency,
    deviceMemory: cohort.deviceMemory,
    webglVendor: cohort.webglVendor,
    webglRenderer: cohort.webglRenderer,
    maxTextureSize: cohort.maxTextureSize,
    // The UA-CH platform version must match the Windows release the cohort represents,
    // or the client hints contradict the machine we are claiming to be.
    chPlatform: 'Windows',
    chPlatformVersion: cohort.chPlatformVersion,
    // A blended persona still gets its own noise, so canvas hashes differ between
    // sessions even though the declared hardware is common.
    canvasNoise: base.canvasNoise,
    audioNoise: base.audioNoise,
  };
}

/** The host's country signal, matched against the region table (longest TLD first). */
export function regionForHost(host: string): (typeof REGIONS)[number] | null {
  if (!host) return null;
  const lower = `.${host.toLowerCase()}`;
  let best: (typeof REGIONS)[number] | null = null;
  let bestLen = 0;
  for (const region of REGIONS) {
    for (const tld of region.tlds) {
      const matches = lower.endsWith(tld);
      if (matches && tld.length > bestLen) {
        best = region;
        bestLen = tld.length;
      }
    }
  }
  return best;
}

/**
 * Keep the persona geographically coherent with the site being visited.
 *
 * Because the persona is US-locked, this never moves the timezone out of the United
 * States. It only re-asserts the US locale for a recognised US host, so a site under
 * .us or .gov sees a browser that agrees with it. The timezone itself is left to the
 * seed, which is what makes it rotate on every refresh.
 */
export function alignToHost(base: FingerprintProfile, host: string): FingerprintProfile {
  const region = regionForHost(host);
  if (!region) return base;
  return {
    ...base,
    language: region.language,
    languages: [...region.languages],
  };
}

/**
 * How large the crowd is for a given profile, as a rough share of the Windows desktop
 * web. Shown in the shield panel so "blend" is not an abstract promise: a high number
 * means you are hiding among many, a low one means you stand out.
 */
export function cohortShare(profile: FingerprintProfile): number {
  let matched = 0;
  let total = 0;
  for (const c of COHORT_PROFILES) {
    total += c.weight;
    if (
      c.platform === profile.platform &&
      c.screen[0] === profile.screenWidth &&
      c.screen[1] === profile.screenHeight
    ) {
      matched += c.weight;
    }
  }
  if (total === 0) return 0;
  return matched / total;
}
