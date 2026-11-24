/**
 * Expo config plugin: Android network hardening for a browser.
 *
 * WHY THIS EXISTS
 *
 * A WebView on Android 9+ refuses plain http:// by default. The failure is not a blank
 * page with a useful message — it is `net::ERR_CLEARTEXT_NOT_PERMITTED`, which the app was
 * showing as an empty screen. That is the "domain error / page not loading" the user hit.
 * A browser cannot refuse http: half the web still serves it, and a user who types an
 * http address expects the page, not a silent failure.
 *
 * So this plugin does three things to the generated Android project:
 *
 *  1. `android:usesCleartextTraffic="true"` on <application>, so http:// loads.
 *  2. A network security config that permits cleartext for every domain, and — because
 *     this is a browser and users legitimately need to reach hosts with private or
 *     self-signed certificates — trusts the system store plus user-installed CAs. It does
 *     NOT blanket-trust everything: a certificate that fails validation still fails, and
 *     the app shows a real error page instead of a blank one.
 *  3. `android:usesCleartextTraffic` is paired with the config so the two cannot disagree.
 *
 * It is a plugin rather than a hand-edited AndroidManifest.xml because `expo prebuild`
 * regenerates that file on every build — a manual edit would be wiped by the next run.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<!--
  Zuno network security policy.

  cleartextTrafficPermitted="true" for every domain: this is a browser, and refusing http
  is what produced the "page will not load" failure. The user asked for the page; the
  browser's job is to fetch it.

  trust-anchors includes the user store so a user who installs a CA (a corporate proxy, a
  debugging proxy, a self-signed host) can reach those sites. It does not disable
  validation: an expired or mismatched certificate still fails, and the app shows the
  error rather than pretending the page loaded.
-->
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

/** Write res/xml/network_security_config.xml into the generated Android project. */
const withNetworkSecurityConfigFile = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'network_security_config.xml'), NETWORK_SECURITY_CONFIG);
      return cfg;
    },
  ]);

/** Point <application> at the config and allow cleartext. */
const withManifestNetworkSettings = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });

module.exports = (config) => withManifestNetworkSettings(withNetworkSecurityConfigFile(config));
