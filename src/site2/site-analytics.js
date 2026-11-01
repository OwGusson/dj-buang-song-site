import { apiFetch } from '../adminAuth';
import { createSiteEventPayload, firstEntryAttribution, normalizeDestination, normalizePageKey } from '../../shared/site-analytics.js';

const SESSION_KEY = 'dj-buang:analytics-session:v1';
let memorySessionId;

export function siteSessionId(storage = globalThis.sessionStorage, cryptoApi = globalThis.crypto) {
  try {
    const current = storage.getItem(SESSION_KEY);
    if (/^[0-9a-f-]{36}$/i.test(current || '')) return current;
    const next = cryptoApi.randomUUID();
    storage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return memorySessionId ||= cryptoApi.randomUUID();
  }
}

export async function sendSiteEvent(eventType, fields = {}, {fetcher = apiFetch, location = globalThis.location, sessionId = siteSessionId()} = {}) {
  const body = createSiteEventPayload(eventType,fields,{eventId:crypto.randomUUID(),sessionId,qaMarker:new URLSearchParams(location.search).get('analytics_qa')==='1'});
  const response = await fetcher('/api/site-analytics', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true,
  });
  if (!response.ok) throw new Error('Analytics event could not be recorded.');
  return response.json();
}

function currentPageKey(location) {
  return normalizePageKey(location.pathname, location.hash, location.search);
}

export function startSiteAnalytics(doc = globalThis.document, location = globalThis.location) {
  if (!doc || !location || location.pathname === '/studio' || location.pathname.startsWith('/studio/')) return;
  const sessionId=siteSessionId();
  const attribution=firstEntryAttribution({sessionId,documentReferrer:doc.referrer||'',search:location.search,hostname:location.hostname});
  let pageKey = currentPageKey(location);
  if (!pageKey) return;
  const sendPageView=()=>{
    const next=currentPageKey(location);
    if(!next||next===pageKey)return;
    pageKey=next;
    void sendSiteEvent('page_view',{pageKey,campaign:attribution.campaign,referrerDomain:attribution.referrerDomain},{sessionId}).catch(()=>{});
  };
  void sendSiteEvent('page_view',{pageKey,campaign:attribution.campaign,referrerDomain:attribution.referrerDomain},{sessionId}).catch(()=>{});
  doc.defaultView?.addEventListener('hashchange',sendPageView);
  doc.addEventListener('click', event => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    const destination = normalizeDestination(anchor.dataset.analyticsDestination, anchor.href);
    let key = destination;
    if (!key) {
      try {
        const url = new URL(anchor.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === '/albums/global-barangay' || url.pathname === '/albums/buang-after-dark') key = 'listen_album';
        else if ((url.pathname === '/' || url.pathname === location.pathname) && url.hash === '#music') key = 'listen_music';
      } catch { return; }
    }
    if (key) void sendSiteEvent('outbound_click',{destination:key,pageKey,campaign:attribution.campaign,referrerDomain:attribution.referrerDomain},{sessionId}).catch(()=>{});
  }, {capture:true});
}
