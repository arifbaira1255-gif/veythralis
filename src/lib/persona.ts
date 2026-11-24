/**
 * Persona engine — the part that makes Zuno behave differently from every other
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
 *   BLEND  — draw from the *most populated* device cohorts, so the persona you present
 *            is shared by millions of other devices. This is the Tor Browser strategy:
 *            uniformity beats false uniqueness. It is the default.
 *
 *   ROTATE — draw from a wide space so a returning tracker cannot link two sessions.
 *            Stronger against long-term correlation, weaker against per-session
 *            uniqueness. For when you care about being unlinkable more than blending in.
 *
 * On top of that, personas are **geo-coherent**: a site under a national TLD gets a
 * timezone and locale that actually matches that country. A German site seeing a
 * browser in Asia/Shanghai with an en-US locale is a stronger signal than a generic
 * fingerprint — so we remove that contradiction rather than create it.
 */

import type { FingerprintProfile } from './fingerprint';

export type PersonaMode = 'blend' | 'rotate';

export const PERSONA_MODE_LABEL: Record<PersonaMode, { title: string; detail: string }> = {
  blend: {
    title: 'Blend into the crowd',
    detail:
      'Present the most common device profile on the web, so you look like millions of other people instead of a unique machine.',
  },
  rotate: {
    title: 'Rotate identity',
    detail:
      'Draw a different profile from a wide space each session, so a tracker cannot link two visits to the same device.',
  },
};

/**
 * The most populated desktop device cohorts. Percentages are rough shares of the
 * desktop web; the engine weights towards the top so a blended persona lands in a
 * large crowd.
 */
export const COHORT_PROFILES: readonly {
  weight: number;
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
}[] = [
  {
    weight: 26,
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
  },
  {
    weight: 19,
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
  },
  {
    weight: 14,
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    screen: [1440, 900],
    colorDepth: 30,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
    maxTextureSize: 16384,
  },
  {
    weight: 11,
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    screen: [1512, 982],
    colorDepth: 30,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    deviceMemory: 16,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    maxTextureSize: 16384,
  },
  {
    weight: 9,
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
  },
  {
    weight: 8,
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
    screen: [1920, 1080],
    colorDepth: 24,
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (Mesa)',
    webglRenderer: 'ANGLE (Mesa, AMD Radeon RX 580, OpenGL 4.5)',
    maxTextureSize: 16384,
  },
  {
    weight: 7,
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
  },
  {
    weight: 6,
    platform: 'MacIntel',
    vendor: 'Apple Computer, Inc.',
    screen: [1920, 1080],
    colorDepth: 30,
    devicePixelRatio: 1,
    hardwareConcurrency: 6,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
    maxTextureSize: 16384,
  },
];

/**
 * Region table: a national TLD or country signal, plus the timezone and locale a device
 * in that country would realistically report.
 */
export const REGIONS: readonly {
  tlds: readonly string[];
  timezone: string;
  timezoneOffset: number;
  language: string;
  languages: readonly string[];
}[] = [
  { tlds: ['.de', '.at', '.ch'], timezone: 'Europe/Berlin', timezoneOffset: -60, language: 'de-DE', languages: ['de-DE', 'de', 'en-US', 'en'] },
  { tlds: ['.fr', '.be', '.lu'], timezone: 'Europe/Paris', timezoneOffset: -60, language: 'fr-FR', languages: ['fr-FR', 'fr', 'en-US', 'en'] },
  { tlds: ['.co.uk', '.uk'], timezone: 'Europe/London', timezoneOffset: 0, language: 'en-GB', languages: ['en-GB', 'en'] },
  { tlds: ['.jp'], timezone: 'Asia/Tokyo', timezoneOffset: -540, language: 'ja-JP', languages: ['ja-JP', 'ja', 'en-US', 'en'] },
  { tlds: ['.in', '.co.in'], timezone: 'Asia/Kolkata', timezoneOffset: -330, language: 'en-IN', languages: ['en-IN', 'en', 'hi-IN'] },
  { tlds: ['.pk', '.com.pk'], timezone: 'Asia/Karachi', timezoneOffset: -300, language: 'en-PK', languages: ['en-PK', 'en', 'ur-PK'] },
  { tlds: ['.br', '.com.br'], timezone: 'America/Sao_Paulo', timezoneOffset: 180, language: 'pt-BR', languages: ['pt-BR', 'pt', 'en-US', 'en'] },
  { tlds: ['.ca'], timezone: 'America/Toronto', timezoneOffset: 300, language: 'en-CA', languages: ['en-CA', 'en', 'fr-CA'] },
  { tlds: ['.au', '.com.au'], timezone: 'Australia/Sydney', timezoneOffset: -660, language: 'en-AU', languages: ['en-AU', 'en'] },
  { tlds: ['.nl'], timezone: 'Europe/Amsterdam', timezoneOffset: -60, language: 'nl-NL', languages: ['nl-NL', 'nl', 'en'] },
  { tlds: ['.es'], timezone: 'Europe/Madrid', timezoneOffset: -60, language: 'es-ES', languages: ['es-ES', 'es', 'en'] },
  { tlds: ['.it'], timezone: 'Europe/Rome', timezoneOffset: -60, language: 'it-IT', languages: ['it-IT', 'it', 'en'] },
  { tlds: ['.se'], timezone: 'Europe/Stockholm', timezoneOffset: -60, language: 'sv-SE', languages: ['sv-SE', 'sv', 'en'] },
  { tlds: ['.pl'], timezone: 'Europe/Warsaw', timezoneOffset: -60, language: 'pl-PL', languages: ['pl-PL', 'pl', 'en'] },
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
 * to a real, populated cohort; `rotate` leaves the wider random draw in place. Either
 * way the identity surfaces (canvas/audio noise, fonts, voices) stay tied to the seed so
 * the session remains internally consistent.
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
 * Make the persona geographically coherent with the site being visited. A site under
 * `.de` should not see a browser claiming Asia/Shanghai and en-US — that contradiction
 * is itself a fingerprint. Only the region surfaces change; hardware stays put.
 */
export function alignToHost(base: FingerprintProfile, host: string): FingerprintProfile {
  const region = regionForHost(host);
  if (!region) return base;
  return {
    ...base,
    timezone: region.timezone,
    timezoneOffset: region.timezoneOffset,
    language: region.language,
    languages: [...region.languages],
  };
}

/**
 * How large the crowd is for a given profile, as a rough share of the desktop web. Shown
 * in the shield panel so "blend" is not an abstract promise: a high number means you are
 * hiding among many, a low one means you stand out.
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
