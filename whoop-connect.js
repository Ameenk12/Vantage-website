/* Fixed-origin, tab-bound WHOOP handoff. No app session is accepted from a URL. */
(function (root) {
  'use strict';
  const KEY = 'vantage.whoop.browser.v1';
  const MAX_AGE = 15 * 60 * 1000;
  const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{32,200}$/.test(value);
  function parseArrival(href) {
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const query = url.searchParams;
    const allowedHash = new Set(['launchState', 'whoopCode', 'whoopError', 'state']);
    const allowedQuery = new Set(['code', 'error', 'error_description', 'error_code']);
    for (const key of hash.keys()) if (!allowedHash.has(key) || hash.getAll(key).length !== 1) throw new Error('Unexpected browser return. Restart from Vantage.');
    for (const key of query.keys()) if (!allowedQuery.has(key) || query.getAll(key).length !== 1) throw new Error('Unexpected sign-in return. Restart from Vantage.');
    const launchState = hash.get('launchState');
    const code = hash.get('whoopCode');
    const error = hash.get('whoopError');
    const state = hash.get('state');
    if (launchState && (!opaque(launchState) || hash.size !== 1 || query.size)) throw new Error('Invalid launch. Restart from Vantage.');
    if ((code || error || state) && ((!code && !error) || (code && error) || !opaque(state) || hash.size !== 2 || query.size)) throw new Error('Invalid WHOOP return. Restart from Vantage.');
    return { launchState, code, error, state, authCode: query.get('code'), authError: query.get('error') };
  }
  function validPending(value, now) {
    return !!value && opaque(value.launchState) && Number.isFinite(value.createdAt) && now >= value.createdAt && now - value.createdAt < MAX_AGE;
  }
  function returnAllowed(value, allowDevelopment = false) {
    try {
      const url = new URL(value);
      if (url.hash || url.username || url.password || value.length > 500) return false;
      const keys = [...url.searchParams.keys()];
      if (keys.some(key => !['status', 'code'].includes(key)) || keys.some(key => url.searchParams.getAll(key).length !== 1)) return false;
      if (!['connected', 'error'].includes(url.searchParams.get('status'))) return false;
      if (url.searchParams.has('code') && !/^[a-z_]{1,80}$/.test(url.searchParams.get('code'))) return false;
      const production = url.protocol === 'vantage.support:' && url.hostname === 'integrations' && url.pathname === '/whoop';
      const development = allowDevelopment && ((url.protocol === 'exp:' && url.pathname.endsWith('/--/integrations/whoop')) || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/integrations/whoop'));
      return !!(production || development);
    } catch { return false; }
  }
  const helpers = { parseArrival, validPending, returnAllowed };
  if (typeof module !== 'undefined' && module.exports) { module.exports = helpers; return; }
  const doc = root.document;
  const el = (id) => doc.getElementById(id);
  let pending;
  let config;
  let busy = false;
  const status = (message) => { el('status').textContent = message; };
  const clear = () => { root.sessionStorage.removeItem(KEY); pending = null; el('password').value = ''; };
  const save = () => root.sessionStorage.setItem(KEY, JSON.stringify(pending));
  function failure(message) {
    const bound = !!(pending && pending.state);
    const retry = !bound && pending && { launchState: pending.launchState, createdAt: pending.createdAt };
    clear();
    if (validPending(retry, Date.now())) { pending = retry; save(); }
    el('signin').hidden = true;
    el('restart').hidden = !pending;
    status(bound ? 'Connection interrupted. Close this tab and start a new connection from Vantage.' : message);
  }
  function lock(value) {
    busy = value;
    for (const node of doc.querySelectorAll('button, input')) node.disabled = value;
  }
  async function digest(value, hex) {
    const bytes = new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return hex ? Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') : root.btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function random() {
    return Array.from(root.crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function request(path, body, token) {
    const response = await root.fetch(config.supabaseUrl + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { apikey: config.anonKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error('Unable to continue. Check your sign-in account, or restart from Vantage.');
    return response.json();
  }
  async function start(session) {
    if (!validPending(pending, Date.now()) || typeof session.access_token !== 'string' || !session.user || typeof session.user.id !== 'string') throw new Error('Sign-in expired. Restart from Vantage.');
    const verifier = random();
    const response = await request('/functions/v1/whoop-auth/browser-start', { launchState: pending.launchState, browserChallenge: await digest(verifier, true) }, session.access_token);
    pending.state = response.state || 'consumed';
    const target = new URL(response.authorizeUrl);
    if (target.protocol !== 'https:' || target.hostname !== 'api.prod.whoop.com' || target.pathname !== '/oauth/oauth2/auth' || !opaque(response.state) || target.searchParams.get('state') !== response.state) throw new Error('Invalid authorization response. Restart from Vantage.');
    pending = { launchState: pending.launchState, createdAt: pending.createdAt, verifier, state: response.state, token: session.access_token, userId: session.user.id, expiresAt: Math.min(Date.now() + MAX_AGE, session.expires_at ? session.expires_at * 1000 : Date.now() + session.expires_in * 1000) };
    if (!Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now()) throw new Error('Sign-in expired. Restart from Vantage.');
    save();
    root.location.replace(target.href);
  }
  async function complete(arrival) {
    if (!validPending(pending, Date.now()) || !opaque(pending.verifier) || !opaque(pending.state) || pending.state !== arrival.state || !pending.token || !pending.userId || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= Date.now()) throw new Error('This tab cannot verify the WHOOP return. Restart the connection from Vantage.');
    const response = await request('/functions/v1/whoop-auth/complete', { state: pending.state, verifier: pending.verifier, ...(arrival.error ? { error: arrival.error } : { code: arrival.code }) }, pending.token);
    if (!returnAllowed(response.returnUrl, config.allowDevelopment)) throw new Error('Invalid app return. Close this tab and return to Vantage.');
    clear();
    status('Connection finished. Returning to Vantage…');
    root.location.replace(response.returnUrl);
  }
  async function action(fn) {
    if (busy) return;
    lock(true);
    try { await fn(); } catch (error) { failure(error instanceof Error ? error.message : 'Unable to continue. Restart from Vantage.'); }
    finally { lock(false); }
  }
  el('password-form').addEventListener('submit', event => {
    event.preventDefault();
    action(async () => {
      status('Signing in to Vantage…');
      const password = el('password').value;
      el('password').value = '';
      await start(await request('/auth/v1/token?grant_type=password', { email: el('email').value.trim(), password }));
    });
  });
  for (const provider of ['google', 'apple']) el(provider).addEventListener('click', () => action(async () => {
    pending.pkce = random(); save();
    const url = new URL(config.supabaseUrl + '/auth/v1/authorize');
    url.search = new URLSearchParams({ provider, redirect_to: root.location.origin + root.location.pathname, code_challenge: await digest(pending.pkce, false), code_challenge_method: 's256' }).toString();
    root.location.replace(url.href);
  }));
  el('restart').addEventListener('click', () => {
    if (pending && pending.state) { clear(); failure('Close this tab and start a new connection from Vantage.'); return; }
    const launch = pending && pending.launchState;
    const createdAt = pending && pending.createdAt;
    clear();
    if (!config || !validPending({ launchState: launch, createdAt }, Date.now())) { failure('Close this tab and start a new connection from Vantage.'); return; }
    pending = { launchState: launch, createdAt }; save();
    el('signin').hidden = false; el('restart').hidden = true;
    status('Sign in to the same Vantage account used in the app.');
  });
  el('cancel').addEventListener('click', () => action(async () => {
    if (pending && pending.state) await complete({ state: pending.state, error: 'access_denied' });
    else { clear(); el('signin').hidden = true; el('restart').hidden = true; status('Connection cancelled. Close this tab and return to Vantage.'); }
  }));
  action(async () => {
    // Capture once, then scrub before config/network operations or error display.
    const href = root.location.href;
    root.history.replaceState(null, '', root.location.pathname);
    const arrival = parseArrival(href);
    const rawConfig = root.VANTAGE_WHOOP_CONFIG;
    if (!rawConfig || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(rawConfig.supabaseUrl) || !rawConfig.anonKey || rawConfig.anonKey.includes('YOUR_')) throw new Error('Browser connection is not configured yet. Return to Vantage.');
    config = { supabaseUrl: rawConfig.supabaseUrl, anonKey: rawConfig.anonKey, allowDevelopment: rawConfig.allowDevelopment === true };
    if (arrival.launchState) {
      clear(); pending = { launchState: arrival.launchState, createdAt: Date.now() }; save();
    } else {
      try { pending = JSON.parse(root.sessionStorage.getItem(KEY)); } catch { pending = null; }
    }
    if (!validPending(pending, Date.now())) { clear(); throw new Error('Connection expired or opened in another tab. Start again from Vantage.'); }
    if (arrival.code || arrival.error) { await complete(arrival); return; }
    if (arrival.authError) throw new Error('Vantage sign-in was cancelled. You can try again.');
    if (arrival.authCode) {
      if (!opaque(pending.pkce) || pending.state) throw new Error('Missing sign-in proof. Restart from Vantage.');
      const verifier = pending.pkce; delete pending.pkce; save();
      await start(await request('/auth/v1/token?grant_type=pkce', { auth_code: arrival.authCode, code_verifier: verifier }));
      return;
    }
    if (pending.state || pending.pkce) throw new Error('Connection interrupted. Restart sign-in or return to Vantage.');
    el('signin').hidden = false;
    status('Sign in to the same Vantage account used in the app.');
  });
})(typeof window === 'undefined' ? globalThis : window);
