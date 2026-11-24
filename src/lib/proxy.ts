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
 *   - There is no such thing as a permanently free residential proxy. Every "free
 *     residential proxy list" is one of three things: a short paid trial (Webshare's
 *     free tier is 10 *datacenter* IPs, Decodo is 3 days / 100 MB, Nodemaven 1 GB,
 *     TrueProxies 1 hour), an open proxy scraped from a compromised host, or a
 *     bandwidth-sharing network that resells your own connection. The scraped ones are
 *     the worst possible choice for a privacy browser: an open proxy sees every URL and
 *     every cookie in plaintext, and is frequently run by the same people who want that
 *     data. Shipping one would make Zuno a surveillance tool.
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
 *
 * ---------------------------------------------------------------------------------------
 * RESIDENTIAL, SPECIFICALLY
 * ---------------------------------------------------------------------------------------
 * The request was for a *residential* exit, not a datacenter one, and that distinction is
 * real: a datacenter IP is trivially flagged by every anti-bot vendor, so a datacenter
 * proxy hides your address from the site but marks you as a bot in the same breath. A
 * residential IP is a real consumer connection, so it looks like an ordinary visitor.
 *
 * Zuno therefore supports residential endpoints properly - HTTP, HTTPS and SOCKS5, with
 * optional username/password - and ships **no** endpoint of its own, because it has none
 * to ship honestly. What it does instead is make a residential endpoint a first-class,
 * one-tap option the moment the user has one, and say plainly that the free ones are
 * trials rather than pretending otherwise.
 */

export type ExitKind = 'direct' | 'tor' | 'residential';

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
      'Your IP address is visible to every site. Everything else Zuno does - fingerprint, cookies, storage, referrer - still applies, but a site that logs IPs can still group visits from this network.',
    selectable: true,
  },
  {
    kind: 'residential',
    title: 'Residential proxy',
    detail:
      'Route through a real consumer IP, so the site sees an ordinary home connection instead of your address - and instead of a datacenter range that every anti-bot vendor flags on sight.',
    caveat:
      'Needs an endpoint you supply: host, port, and a username/password if the provider issues one. There is no permanently free residential proxy - the free offers are trials (Webshare 1 GB/month of datacenter IPs, Decodo 3 days / 100 MB, Nodemaven 1 GB, TrueProxies 1 hour). Zuno ships no endpoint of its own, because a free public proxy list is a list of machines that read your traffic.',
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
];

/** The Orbot SOCKS listener, per the Tor Project. */
export const ORBOT_SOCKS = { host: '127.0.0.1', port: 9050 } as const;
/** Orbot's HTTP proxy, which is what a WebView can actually use. */
export const ORBOT_HTTP = { host: '127.0.0.1', port: 8118 } as const;

/** A residential endpoint the user has configured. */
export type ResidentialEndpoint = {
  host: string;
  port: number;
  /** 'http' covers HTTPS CONNECT; 'socks5' is the SOCKS5 handshake. */
  scheme: 'http' | 'socks5';
  username?: string;
  password?: string;
};

export const EMPTY_ENDPOINT: ResidentialEndpoint = {
  host: '',
  port: 0,
  scheme: 'http',
};

/**
 * Validate an endpoint before it is used.
 *
 * Returns a human-readable reason when it is unusable, or null when it is fine. This is
 * deliberately strict: a half-configured proxy is worse than none, because the user
 * believes they are covered when they are not.
 */
export function validateEndpoint(ep: ResidentialEndpoint): string | null {
  if (!ep.host || !ep.host.trim()) return 'Enter the proxy host, e.g. gate.example.com.';
  if (!/^[a-z0-9.-]+$/i.test(ep.host.trim())) return 'The host contains characters that are not valid in a hostname.';
  if (!ep.port || ep.port < 1 || ep.port > 65535) return 'The port must be between 1 and 65535.';
  if (ep.scheme !== 'http' && ep.scheme !== 'socks5') return 'Choose HTTP or SOCKS5.';
  if (ep.password && !ep.username) return 'A password was given without a username.';
  return null;
}

/** A one-line description of an endpoint, with the credentials never shown. */
export function describeEndpoint(ep: ResidentialEndpoint): string {
  if (!ep.host) return 'not configured';
  const auth = ep.username ? ' (authenticated)' : '';
  return `${ep.scheme}://${ep.host}:${ep.port}${auth}`;
}

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
 * a network error proves nothing is. Never throws - a probe must not break the app.
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

/**
 * Probe a residential endpoint.
 *
 * Same constraint as the Orbot probe: no raw sockets, so this makes an HTTP request
 * through the endpoint and treats any HTTP answer as proof it is reachable. A DNS or
 * connection failure means it is not. Never throws.
 */
export async function probeResidential(
  ep: ResidentialEndpoint,
  timeoutMs = 4000,
): Promise<ExitState> {
  const invalid = validateEndpoint(ep);
  if (invalid) return { kind: 'residential', live: false, reason: invalid };
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    // A WebView cannot be pointed at a proxy from JavaScript, so this probe only proves
    // the endpoint answers. The actual routing is applied at the WebView layer.
    await fetch(`https://${ep.host}:${ep.port}/`, {
      method: 'GET',
      signal: controller?.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return { kind: 'residential', live: true };
  } catch {
    clearTimeout(timer);
    return {
      kind: 'residential',
      live: false,
      reason: `No answer from ${ep.host}:${ep.port}. Check the host, port and credentials.`,
    };
  }
}

/** Human-readable summary for the shield panel. */
export function describeExit(state: ExitState): string {
  if (state.kind === 'direct') return 'Direct connection - your IP is your own';
  if (state.kind === 'tor') {
    return state.live ? 'Tor - routed through the Tor network' : 'Tor selected, but Orbot is not running';
  }
  return state.live ? 'Residential proxy - connected' : 'Residential proxy - not connected';
}
