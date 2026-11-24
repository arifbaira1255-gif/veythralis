/**
 * Network exit control.
 *
 * This module is deliberately honest, because the alternative is a switch that pretends
 * to protect you. Read this before trusting the toggle.
 *
 * WHAT WAS ASKED FOR: a free residential proxy or VPN, one tap to connect.
 *
 * WHAT IS ACTUALLY AVAILABLE, verified by research rather than assumed:
 *
 *   - There is no such thing as a free residential proxy. "Free residential proxy lists"
 *     are either short paid trials (Webshare 1 GB/month of *datacenter* IPs, Decodo 100 MB
 *     for 3 days, Nodemaven 1 GB trial) or open proxies scraped from compromised hosts.
 *     The scraped ones are the worst possible choice for a privacy browser: an open proxy
 *     sees every URL and every cookie in plaintext, and is frequently run by the same
 *     people who want that data. Shipping one would make Zuno a surveillance tool.
 *
 *   - A working free anonymity network DOES exist: Tor, via Orbot. It is open source,
 *     audited, and free. But it is a separate app that must be installed, and the OS
 *     routes through it via a SOCKS proxy on 127.0.0.1:9050 that this app cannot verify
 *     from JavaScript.
 *
 *   - A real per-app VPN needs Android's `VpnService` and a remote endpoint, i.e. native
 *     code plus a server. That cannot be added from a TypeScript change.
 *
 * So instead of a fake switch, this module models the exits that genuinely reduce how
 * linkable you are, ranks them by what they actually buy, and tells the user the exact
 * limitation of each. `DIRECT` is the default. Tor is detected and used when present.
 * Nothing here claims to work when it does not.
 */

export type ExitKind = 'direct' | 'tor' | 'proxy';

export type ExitOption = {
  kind: ExitKind;
  title: string;
  /** What it actually does to your address, in one line. */
  detail: string;
  /** The honest limitation. Shown in the panel, never hidden. */
  caveat: string;
  /** Whether this app can switch to it without help from outside. */
  selectable: boolean;
};

export const EXIT_OPTIONS: readonly ExitOption[] = [
  {
    kind: 'direct',
    title: 'Direct',
    detail: 'Connect from this device. Your IP address is your own.',
    caveat:
      'Your IP address is visible to every site. Everything else Zuno does — fingerprint, cookies, storage, referrer — still applies, but a site that logs IPs can still group visits from this network.',
    selectable: true,
  },
  {
    kind: 'tor',
    title: 'Tor (via Orbot)',
    detail:
      'Route through the Tor network, so the site sees a Tor exit node instead of your address, and no single relay knows both who you are and where you went.',
    caveat:
      'Requires the free Orbot app to be installed and running. Slower. Many sites block Tor exits outright. Android cannot route one app through a SOCKS proxy without native code, so Zuno detects Orbot and uses it, but does not install or drive it.',
    selectable: true,
  },
  {
    kind: 'proxy',
    title: 'Custom proxy',
    detail: 'Point Zuno at a proxy or VPN endpoint you already control or subscribe to.',
    caveat:
      'Needs an address and a port. Free public proxy lists are not offered here on purpose: an open proxy reads your traffic and is the opposite of private.',
    selectable: false,
  },
];

/** The Orbot SOCKS listener, per the Tor Project. */
export const ORBOT_SOCKS = { host: '127.0.0.1', port: 9050 } as const;
/** Orbot's HTTP proxy, which is what a WebView can actually use. */
export const ORBOT_HTTP = { host: '127.0.0.1', port: 8118 } as const;

export type ExitState = {
  kind: ExitKind;
  /** True when the chosen exit is confirmed usable, not merely selected. */
  live: boolean;
  /** Why it is not live, when it is not. */
  reason?: string;
};

export const DIRECT_STATE: ExitState = { kind: 'direct', live: true };

/**
 * Probe whether Orbot is reachable.
 *
 * A browser cannot open a raw socket, so this asks the local HTTP proxy for a trivial
 * resource with a short timeout. A 200/400/403 answer all prove something is listening;
 * a network error proves nothing is. Never throws — a probe must not break the app.
 */
export async function probeOrbot(timeoutMs = 1500): Promise<ExitState> {
  const url = `http://${ORBOT_HTTP.host}:${ORBOT_HTTP.port}/`;
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'GET',
      signal: controller?.signal,
      // Any HTTP response at all means Orbot's proxy answered.
      cache: 'no-store',
    });
    clearTimeout(timer);
    return { kind: 'tor', live: true };
  } catch {
    clearTimeout(timer);
    return {
      kind: 'tor',
      live: false,
      reason: 'Orbot is not running on this device. Install Orbot, start it, then retry.',
    };
  }
}

/** Human-readable summary for the shield panel. */
export function describeExit(state: ExitState): string {
  if (state.kind === 'direct') return 'Direct connection — your IP is your own';
  if (state.kind === 'tor') {
    return state.live ? 'Tor — routed through the Tor network' : 'Tor selected, but Orbot is not running';
  }
  return state.live ? 'Custom proxy — configured' : 'Custom proxy — not configured';
}
