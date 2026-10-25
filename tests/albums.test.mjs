import {studioLease} from './studio-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultAlbum,validateAlbum,ALBUM_KEY} from '../functions/_lib/albums.js';
import {onRequestGet as albums,onRequestPost as saveAlbum} from '../functions/api/albums.js';
import {onRequestGet as catalog} from '../functions/api/songs.js';
import {onRequestGet as media} from '../functions/files/[[key]].js';
import {onRequestGet as download} from '../functions/api/download.js';
const origin='https://dj-buang.com';
const song={id:'album-song',title:'Album track',artist:'DJ-Buang',albumId:'global-barangay',albumTrackNumber:1,visibility:'public',status:'published',audioUrl:origin+'/files/album.mp3',lyrics:'private audio companion',durationSeconds:90};
function context(status='available',downloadable=false){
 const objects=new Map([[ALBUM_KEY,JSON.stringify({...defaultAlbum(),status,downloadable,links:{spotify:'https://open.spotify.com/album/test'}})],['data/songs.json',JSON.stringify([song,{...song,id:'private',visibility:'private'},{id:'single',title:'Standalone',visibility:'public',audioUrl:origin+'/files/single.mp3'}])],['album.mp3','audio']]);
 return {objects,request:new Request(origin+'/api/albums'),data:{},env:{GLOBAL_BARANGAY_RELEASED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'synthetic',FILES:{async get(key){const lease=studioLease(key);if(lease)return lease;const value=objects.get(key);return value===undefined?null:{text:async()=>value,body:new Response(value).body,size:value.length,writeHttpMetadata(){}};},async put(key,value){objects.set(key,typeof value==='string'?value:await new Response(value).text());}}}};
}
test('album validation rejects unsafe links and requires a real platform destination',()=>{
 assert.equal(validateAlbum(defaultAlbum()).status,'available');
 for(const change of [{status:'platforms'},{status:'invalid'},{coverUrl:'//other.example/a'},{coverUrl:'/\\other.example/a'},{coverUrl:'javascript:alert(1)'},{links:{spotify:'https://evil.example/album/x'}},{links:{spotify:'https://user:pass@open.spotify.com/album/x'}}])assert.throws(()=>validateAlbum({...defaultAlbum(),...change}));
 assert.equal(validateAlbum({...defaultAlbum(),status:'platforms',links:{spotify:'https://open.spotify.com/album/test'}}).status,'platforms');
});
test('availability blocks catalog and direct media while preserving standalone songs',async()=>{
 for(const status of ['draft','hidden','platforms']){
  const c=context(status);assert.deepEqual((await (await catalog(c)).json()).map(s=>s.id),['single']);
  c.request=new Request(origin+'/files/album.mp3');assert.equal((await media(c)).status,404);
  c.request=new Request(origin+'/api/download?id=album-song');assert.equal((await download(c)).status,404);
 }
 const c=context();assert.equal((await (await catalog(c)).json()).length,2);
 c.env.GLOBAL_BARANGAY_RELEASED='false';assert.deepEqual((await (await catalog(c)).json()).map(s=>s.id),['single']);
});
test('platforms only exposes track metadata without audio IDs or private tracks',async()=>{
 const c=context('platforms');const result=await (await albums(c)).json();assert.equal(result.album.tracks.length,1);assert.equal(result.album.tracks[0].title,song.title);
 assert.equal(result.album.tracks[0].audioUrl,undefined);assert.equal(result.album.tracks[0].id,undefined);assert.equal(result.album.tracks[0].lyrics,undefined);
 c.env.GLOBAL_BARANGAY_RELEASED='false';assert.deepEqual(await (await albums(c)).json(),{album:{id:'global-barangay',status:'available'}});
});
test('album download block overrides individual defaults',async()=>{
 const c=context();assert.equal((await (await catalog(c)).json())[0].downloadable,false);
 c.request=new Request(origin+'/api/download?id=album-song');assert.equal((await download(c)).status,403);
 c.objects.set(ALBUM_KEY,JSON.stringify({...defaultAlbum(),downloadable:true}));assert.equal((await download(c)).status,200);
 c.objects.set('data/songs.json',JSON.stringify([{...song,downloadable:false}]));assert.equal((await download(c)).status,403);
});
test('saving requires verified administrator MFA, preserves songs and backs up album settings',async t=>{
 const c=context();const body=JSON.stringify({...defaultAlbum(),status:'hidden'});
 const request=aal=>new Request(origin+'/api/albums',{method:'POST',headers:{Origin:origin,...(aal?{Authorization:'Bearer x.'+btoa(JSON.stringify({aal,session_id:'test-session'}))+'.x'}:{})},body});
 c.request=request();assert.equal((await saveAlbum(c)).status,401);
 t.mock.method(globalThis,'fetch',async()=>Response.json({id:'admin',app_metadata:{role:'admin'}}));
 c.request=request('aal1');assert.equal((await saveAlbum(c)).status,401);
 const songs=c.objects.get('data/songs.json');c.request=request('aal2');assert.equal((await saveAlbum(c)).status,200);
 assert.equal(JSON.parse(c.objects.get(ALBUM_KEY)).status,'hidden');assert.equal(c.objects.get('data/songs.json'),songs);assert.ok([...c.objects.keys()].some(key=>key.startsWith('data/backups/albums-')));
});
