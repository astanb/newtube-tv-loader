/* NewTube loader for TizenBrew (Samsung TVs).
 * Runs NewTube's interface inside YouTube's TV page. It holds no app code itself: it loads a release
 * from NewTube's server, and only runs one whose signature matches the public key below (the private
 * key is kept offline). The last good release is kept on the TV, so it starts instantly and works
 * offline; a newer one is fetched in the background for next time. Plain ES5 for 2017 TVs. */
(function () {
  'use strict';
  // TizenBrew injects into every frame; only YouTube's top page runs NewTube (not our own frame).
  if (window.top !== window || window.__ntLoader) return;
  window.__ntLoader = true;

  var BASE = 'https://newtube-api.astanb.workers.dev/tv/';
  var KEY = {
    kty: 'RSA',
    e: 'AQAB',
    n: 'wQan4XSX0Wpo3gtfEZBWpW8Lhc582OGoHLRZ7Ae5cBEbdxR7JuQUV5L61rWA4voUByOhnXyQg4tkZfySho5Kc3jSBpgtrE2BheCBOAGWkfeNJkwGHy3RbGrzO3iJDEofpZ1HLBhWXj2FbIIztJqD3LHylSHugPSWIAAQfnI3XjlOE9INVC_aOAODHZxcQbhijdgtRcdy9xmrwIyASpp4aCEGqw3ytf1ImvF0pcvF1Se1jH9mIDSEcttz0KAORbx2ptVTp8t6UFN_IZ56SDZx9F-duAzFqU91th2Pfs7LiR14EBG_pqhPKIHJmbqHueK61orHlzlKd5051T-YMv-uCLYVNHeTqMOtxVhL0NkzFeJkYr2XJW2M6dy_bmf6Dkm4TYSKvfkjJ9phESwoP84EFYOVXtmAMtDvy1i1tFnRHw8EZAGTpfwHv0czxWpHikmjVa6uYNcQD3m9EoengEmD4ICG8GB5Xm-bYxorWA7GRMaf328C-F5ohYkepeql-VcP',
  };
  var STORE = 'newtube.release';
  var LOADER = '1.0.3';
  // Progress reports (no personal data), so a failure on the TV can be seen without a debugger.
  var report = function (msg, data) {
    try {
      fetch('https://newtube-api.astanb.workers.dev/api/log', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ session: 'loader', version: LOADER, lines: [{ t: Date.now(), msg: msg, data: data ? JSON.stringify(data) : undefined }] }),
      })['catch'](function () {});
    } catch (e) {}
  };

  var stored = function () {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
  };
  var started = false;
  var run = function (code) {
    if (started) return;
    started = true;
    var script = code;
    // Newer TV engines enforce Trusted Types on YouTube's page; 2017 engines don't have them.
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      script = window.trustedTypes.createPolicy('newtube-loader', { createScript: function (s) { return s; } }).createScript(code);
    }
    (0, eval)(script);
  };
  var bytes = function (text) {
    var out = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff; // releases are ASCII only
    return out;
  };
  var b64 = function (s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  var verify = function (code, sig) {
    if (/[^\x00-\x7f]/.test(code)) return Promise.resolve(false);
    return crypto.subtle.importKey('jwk', KEY, { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } }, false, ['verify'])
      .then(function (key) { return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64(sig), bytes(code)); });
  };
  var get = function (url) {
    return fetch(url + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.text();
    });
  };

  // 1. The release kept on the TV (checked when it was saved): start now, before YouTube's own code.
  var have = stored();
  report('loader start', { kept: have ? have.version : null, url: location.href.slice(0, 60), subtle: !!(window.crypto && crypto.subtle), fetch: typeof fetch });
  if (have && have.code) {
    try { run(have.code); report('ran kept release', { version: have.version }); } catch (e) { started = false; report('kept release failed', { error: String(e) }); }
  }

  // 2. Check for a newer release; keep it only if its signature is good.
  get(BASE + 'manifest.json').then(function (text) {
    var m = JSON.parse(text);
    if (have && have.version === m.version) return;
    return get(BASE + 'bundle.js').then(function (code) {
      return verify(code, m.sig).then(function (ok) {
        if (!ok) throw new Error('bad signature for release ' + m.version);
        try { localStorage.setItem(STORE, JSON.stringify({ version: m.version, code: code })); } catch (e) { report('could not keep release', { error: String(e) }); }
        report('release verified', { version: m.version });
        if (!started) { run(code); report('ran new release', { version: m.version }); } // first run on this TV; later releases apply next time
      });
    });
  })['catch'](function (e) {
    report('loader error', { error: String((e && e.message) || e) });
    try { console.error('NewTube loader: ' + (e && e.message)); } catch (x) {}
  });
})();
