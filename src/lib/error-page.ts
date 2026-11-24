/**
 * Error page shown inside a tab when a load fails.
 *
 * Before this existed, a failed load left the WebView blank: the user saw an empty screen
 * and had no way to tell a dead network from a blocked domain from a certificate problem.
 * The "domain error / page will not load" report was really "the app showed nothing".
 *
 * The page is deliberately plain HTML with no external resources — it has to render when
 * the network is exactly what is broken.
 */

export type LoadFailure = {
  /** The URL that failed. */
  url: string;
  /** A short machine code, e.g. 'ERR_CLEARTEXT_NOT_PERMITTED'. */
  code: string;
  /** The WebView's own description, when it gave one. */
  description: string;
  /** HTTP status, when the failure was an HTTP error rather than a transport error. */
  status?: number;
};

/**
 * Turn a WebView error into something a person can act on.
 *
 * The mapping is by substring because the codes differ between the Android WebView and
 * the iOS one, and a browser has to explain both. An unrecognised code still gets a
 * sensible message rather than being swallowed.
 */
export function explainFailure(code: string, description: string): { title: string; hint: string } {
  const c = `${code} ${description}`.toLowerCase();
  if (c.includes('cleartext')) {
    return {
      title: 'This site only offers an insecure connection',
      hint: 'The address is http:// and the site does not support https://. Zuno allows it, so if you still see this the site itself is refusing the connection.',
    };
  }
  if (c.includes('ssl') || c.includes('cert') || c.includes('certificate')) {
    return {
      title: 'The site’s security certificate is not trusted',
      hint: 'The certificate is expired, issued for a different name, or signed by an authority this device does not know. If you trust this site, install its certificate in Android settings and reload.',
    };
  }
  if (c.includes('name_not_resolved') || c.includes('dns') || c.includes('unknown host')) {
    return {
      title: 'That address could not be found',
      hint: 'The domain does not resolve. Check the spelling, or the site may be down.',
    };
  }
  if (c.includes('timeout') || c.includes('timed_out')) {
    return {
      title: 'The site took too long to answer',
      hint: 'The connection timed out. If you are on a proxy or VPN, try turning it off and reloading.',
    };
  }
  if (c.includes('refused') || c.includes('connection_reset') || c.includes('connection_closed')) {
    return {
      title: 'The site refused the connection',
      hint: 'The server closed the connection. This is usually the site, not the browser.',
    };
  }
  if (c.includes('internet_disconnected') || c.includes('network_changed') || c.includes('offline')) {
    return {
      title: 'No internet connection',
      hint: 'This device is offline. Reconnect and reload.',
    };
  }
  if (c.includes('unauthorized') || c.includes('not authorized') || c.includes('403')) {
    return {
      title: 'This site refused to serve the page',
      hint: 'The server returned an authorization error. It may be blocking this network or this region.',
    };
  }
  if (c.includes('blocked') || c.includes('blocklist')) {
    return {
      title: 'Zuno blocked this request',
      hint: 'A tracker or cloaked-analytics rule matched. You can allow it from the shield menu.',
    };
  }
  return {
    title: 'This page could not be loaded',
    hint: 'The request failed before the page arrived. Reloading often fixes it.',
  };
}

/** Escape text for safe interpolation into the error document. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The error document, as a data: URL the WebView can load.
 *
 * It is a data: URL rather than a React view because the WebView is what failed; swapping
 * the whole component out would lose the tab's history and its back button.
 */
export function buildErrorPage(failure: LoadFailure, dark: boolean): string {
  const { title, hint } = explainFailure(failure.code, failure.description);
  const bg = dark ? '#08080E' : '#FFFFFF';
  const fg = dark ? '#E8E8F0' : '#111118';
  const muted = dark ? '#8A8A9E' : '#5A5A6E';
  const card = dark ? '#14141E' : '#F4F4F8';
  const border = dark ? '#26263A' : '#E0E0E8';
  const accent = '#4C6FFF';

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: ${dark ? 'dark' : 'light'}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 20px;
    background: ${bg}; color: ${fg};
    font: 15px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; justify-content: center;
    min-height: 100vh;
  }
  .wrap { max-width: 520px; margin: 0 auto; width: 100%; }
  .badge {
    display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: .08em;
    text-transform: uppercase; color: ${accent};
    border: 1px solid ${accent}; border-radius: 999px;
    padding: 3px 10px; margin-bottom: 16px;
  }
  h1 { font-size: 21px; line-height: 1.3; margin: 0 0 10px; font-weight: 650; }
  p.hint { color: ${muted}; margin: 0 0 20px; }
  .card {
    background: ${card}; border: 1px solid ${border}; border-radius: 12px;
    padding: 14px 16px; margin-bottom: 20px;
  }
  .row { display: flex; gap: 10px; font-size: 13px; padding: 5px 0; }
  .row .k { color: ${muted}; min-width: 74px; flex: none; }
  .row .v { word-break: break-all; font-family: ui-monospace, Menlo, monospace; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; }
  button {
    font: inherit; font-weight: 600; cursor: pointer;
    border-radius: 10px; padding: 11px 18px; border: 1px solid ${border};
    background: transparent; color: ${fg};
  }
  button.primary { background: ${accent}; border-color: ${accent}; color: #fff; }
</style>
</head><body>
<div class="wrap">
  <span class="badge">Load failed</span>
  <h1>${esc(title)}</h1>
  <p class="hint">${esc(hint)}</p>
  <div class="card">
    <div class="row"><span class="k">Address</span><span class="v">${esc(failure.url)}</span></div>
    <div class="row"><span class="k">Reason</span><span class="v">${esc(failure.code || 'unknown')}</span></div>
    ${failure.status ? `<div class="row"><span class="k">Status</span><span class="v">${failure.status}</span></div>` : ''}
    ${failure.description ? `<div class="row"><span class="k">Detail</span><span class="v">${esc(failure.description)}</span></div>` : ''}
  </div>
  <div class="actions">
    <button class="primary" onclick="location.href='${esc(failure.url)}'">Try again</button>
    <button onclick="history.back()">Go back</button>
  </div>
</div>
</body></html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
