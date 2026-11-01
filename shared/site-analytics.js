const SOURCES = new Set(['facebook','instagram','tiktok','youtube','dia','google','spotify','suno','other']);
const MEDIUMS = new Set(['social','livestream','profile','bio','post','story','search','referral','other']);
const CAMPAIGNS = new Set(['global-barangay-launch','dj-buang-2-launch','social-launch','dia-livestream','music-release','other']);
const SECTIONS = new Set(['music','requests','merch','faq','privacy']);
const INTERNAL_HOSTS = new Set(['dj-buang.com','www.dj-buang.com','dj-buang-song-site.pages.dev','codex-dj-buang-2.dj-buang-song-site.pages.dev']);
const DESTINATIONS = new Set(['spotify_presave','spotify','apple_music','youtube_music','facebook','instagram','tiktok','youtube','listen_album','listen_music']);

export function normalizePageKey(pathname, hash = '', search = '') {
  const params = new URLSearchParams(search);
  if (params.has('inbox') || params.has('thread') || params.has('conversation')) return null;
  if (pathname === '/studio' || pathname.startsWith('/api/')) return null;
  if (pathname === '/' && params.has('song')) return '/shared-song';
  if (pathname === '/') {
    const section = String(hash).replace(/^#/, '').toLowerCase();
    return SECTIONS.has(section) ? `/#${section}` : '/';
  }
  if (['/albums/global-barangay','/albums/buang-after-dark'].includes(pathname.replace(/\/$/, ''))) return pathname.replace(/\/$/, '');
  return '/other-public-page';
}

export function sanitizeReferrerHostname(value, ownHost = 'dj-buang.com') {
  if (typeof value !== 'string' || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value.trim())) return null;
  const host = value.trim().toLowerCase().replace(/^www\./, '');
  const own = String(ownHost).toLowerCase().replace(/^www\./, '');
  if (!host || host === own || INTERNAL_HOSTS.has(host) || host === 'localhost' || !host.includes('.') || /^\d+(\.\d+){3}$/.test(host) || host.includes(':')) return null;
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null;
  return host;
}

export function sanitizeReferrerDomain(value, ownHost = 'dj-buang.com') {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:','https:'].includes(url.protocol)) return null;
    return sanitizeReferrerHostname(url.hostname,ownHost);
  } catch { return null; }
}

function allowlisted(value, set) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  return set.has(clean) ? clean : null;
}

export function sanitizeCampaign(value = {}) {
  return {
    source: allowlisted(value.source, SOURCES),
    medium: allowlisted(value.medium, MEDIUMS),
    campaign: allowlisted(value.campaign, CAMPAIGNS),
  };
}

export function firstEntryAttribution({sessionId,documentReferrer='',search='',hostname='dj-buang.com',storage=globalThis.sessionStorage}={}) {
  const key='dj-buang:analytics-attribution:v1';
  try {
    const existing=JSON.parse(storage.getItem(key)||'null');
    if(existing?.sessionId===sessionId&&existing?.attribution)return existing.attribution;
  } catch { /* Browser storage is optional. */ }
  const attribution={
    referrerDomain:sanitizeReferrerDomain(documentReferrer,hostname),
    campaign:sanitizeCampaign(Object.fromEntries(['utm_source','utm_medium','utm_campaign'].map(name=>[name.replace('utm_',''),new URLSearchParams(search).get(name)]))),
  };
  try{storage.setItem(key,JSON.stringify({sessionId,attribution}));}catch{/* Keep this session usable when storage is blocked. */}
  return attribution;
}

export function createSiteEventPayload(eventType,fields,{sessionId,eventId,qaMarker=false}={}){
  return {...fields,eventId,sessionId,eventType,qaMarker:qaMarker===true};
}

export function sourceLabel(campaign, referrerDomain) {
  if (campaign?.source) return campaign.source;
  if (!referrerDomain) return 'direct/unknown';
  const under=(domain,suffix)=>domain===suffix||domain.endsWith(`.${suffix}`);
  if (under(referrerDomain,'facebook.com')||referrerDomain==='fb.me') return 'facebook';
  if (under(referrerDomain,'instagram.com')) return 'instagram';
  if (under(referrerDomain,'tiktok.com')||referrerDomain==='vm.tiktok.com') return 'tiktok';
  if (under(referrerDomain,'youtube.com')||referrerDomain==='youtu.be') return 'youtube';
  if (under(referrerDomain,'google.com')) return 'google';
  if (under(referrerDomain,'bing.com')) return 'bing';
  if (under(referrerDomain,'duckduckgo.com')) return 'duckduckgo';
  if (under(referrerDomain,'spotify.com')) return 'spotify';
  if (under(referrerDomain,'suno.com')) return 'suno';
  return referrerDomain;
}

export function deviceGroup(userAgent = '') {
  const ua = String(userAgent).slice(0, 1000).toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'tablet';
  if (/android/.test(ua)&&!/mobile/.test(ua)) return 'tablet';
  if (/android|iphone|ipod|mobile|windows phone/.test(ua)) return 'mobile';
  if (ua) return 'desktop';
  return 'unknown';
}

export function normalizeDestination(explicit, href = '') {
  if (allowlisted(explicit, DESTINATIONS)) return explicit;
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'distrokid.com' && url.pathname.includes('/hyperfollow/')) return 'spotify_presave';
    if (host === 'spotify.com' || host.endsWith('.spotify.com')) return 'spotify';
    if (host === 'music.apple.com') return 'apple_music';
    if (host === 'music.youtube.com') return 'youtube_music';
    if (host === 'facebook.com' || host.endsWith('.facebook.com')) return 'facebook';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  } catch { return null; }
  return null;
}

export function createRateLimiter({limit = 60, windowMs = 60_000, maxEntries = 10_000} = {}) {
  const buckets = new Map();
  return function allow(key, now = Date.now()) {
    if (!key) return false;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) bucket = {start: now, count: 0};
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > maxEntries) {
      for (const [entry, value] of buckets) if (now - value.start >= windowMs) buckets.delete(entry);
      while (buckets.size > maxEntries) buckets.delete(buckets.keys().next().value);
    }
    return bucket.count <= limit;
  };
}
