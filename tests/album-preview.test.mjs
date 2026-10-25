import {studioLease} from './studio-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, PREVIEW_HOST } from '../functions/api/album-preview.js';
const token=aal=>'e30.'+Buffer.from(JSON.stringify({aal,session_id:'test-session'})).toString('base64url')+'.signature';
test('review catalog is restricted to the stable preview host and verified administrator MFA',async()=>{
  const oldFetch=globalThis.fetch;
  const track={id:'review',albumId:'global-barangay',visibility:'private',status:'draft',downloadable:false};
  let reads=0,role='admin';
  const context=(host,aal)=>({request:new Request('https://'+host+'/api/album-preview',{headers:aal?{Authorization:'Bearer '+token(aal)}:{}}),env:{SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'test',FILES:{get:async(key)=>{if(key.startsWith('data/studio-revoked/'))return null;const lease=studioLease(key,'user');if(lease)return lease;reads++;return {text:async()=>JSON.stringify([track])};}}}});
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'user',app_metadata:{role}}));
  try{
    assert.deepEqual(await (await onRequestGet(context('dj-buang.com','aal2'))).json(),{tracks:[]});
    assert.deepEqual(await (await onRequestGet(context('other.pages.dev','aal2'))).json(),{tracks:[]});
    assert.equal((await onRequestGet(context(PREVIEW_HOST))).status,401);
    assert.equal((await onRequestGet(context(PREVIEW_HOST,'aal1'))).status,401);
    role='listener';assert.equal((await onRequestGet(context(PREVIEW_HOST,'aal2'))).status,401);
    assert.equal(reads,0);
    role='admin';const response=await onRequestGet(context(PREVIEW_HOST,'aal2'));
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    const result=await response.json();assert.equal(result.adminAlbumPreview,true);assert.equal(result.tracks[0].downloadable,false);
    assert.equal(track.visibility,'private');assert.equal(track.status,'draft');
  }finally{globalThis.fetch=oldFetch;}
});
