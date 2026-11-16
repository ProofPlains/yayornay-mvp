// Only Google's normal OAuth authorization parameters may cross the boundary.
export function checkedGoogleRedirect(location: string | null, expectedCallback: string): URL | null {
  try {
    const url = new URL(location || '');
    if (url.origin !== 'https://accounts.google.com' || url.username || url.password ||
      url.pathname !== '/o/oauth2/v2/auth' || url.hash) return null;
    const p = url.searchParams;
    const allowed = new Set(['client_id','prompt','redirect_uri','response_type','scope','state']);
    if ([...p.keys()].some(k => !allowed.has(k) || p.getAll(k).length !== 1)
      || p.get('redirect_uri') !== expectedCallback || p.get('response_type') !== 'code'
      || p.get('prompt') !== 'select_account'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.get('state') || '')
      || !/^[a-z0-9.-]+\.apps\.googleusercontent\.com$/i.test(p.get('client_id') || '')
      || !p.get('scope')?.split(/\s+/).every(x => ['openid','email','profile',
        'https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'].includes(x))) return null;
    return url;
  } catch { return null; }
}
