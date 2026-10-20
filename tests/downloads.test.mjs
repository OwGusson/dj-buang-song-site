import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as saveSong } from '../functions/api/songs.js';
import { onRequestGet as download } from '../functions/api/download.js';

const origin='https://dj-buang.com';
function setup(song){
 const objects=new Map([['data/songs.json',JSON.stringify([song])],['media/track.mp3','test audio']]);
 const writes=[];
 return {request:new Request(origin+'/api/download?id=one'),data:{},writes,env:{FILES:{
   async get(key){const text=objects.get(key);return text===undefined?null:{text:async()=>text,body:new Response(text).body,size:text.length,httpMetadata:{contentType:'audio/mpeg'}};},
   async put(key,value){writes.push(key);objects.set(key,typeof value==='string'?value:await new Response(value).text());},
 }}};
}
const song={id:'one',title:'Þín saga',visibility:'public',status:'published',audioUrl:origin+'/files/media/track.mp3'};
test('legacy songs remain downloadable and use a safe attachment filename',async()=>{
 const response=await download(setup(song));assert.equal(response.status,200);assert.equal(await response.text(),'test audio');
 assert.match(response.headers.get('Content-Disposition'),/attachment/);assert.match(response.headers.get('Content-Disposition'),/%C3%9E/);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('listening-only songs deny the dedicated download route',async()=>{
 assert.equal((await download(setup({...song,downloadable:false}))).status,403);
});
test('private, hidden, draft and missing songs cannot be downloaded anonymously',async()=>{
 for(const patch of [{visibility:'private'},{status:'draft'},{status:'hidden'},{id:'other'}])assert.equal((await download(setup({...song,...patch}))).status,404);
});
test('external audio sources cannot turn downloads into a proxy',async()=>{
 assert.equal((await download(setup({...song,audioUrl:'https://evil.example/file.mp3'}))).status,404);
});
test('a download preference is persisted and survives unrelated catalog edits',async()=>{
 const ctx=setup(song);ctx.data.admin={id:'admin'};
 ctx.request=new Request(origin+'/api/songs',{method:'POST',body:JSON.stringify({id:'one',downloadable:false})});
 assert.equal((await saveSong(ctx)).status,200);assert.equal((await download(ctx)).status,404);
 const stored=JSON.parse(await (await ctx.env.FILES.get('data/songs.json')).text());assert.equal(stored[0].downloadable,false);
 ctx.request=new Request(origin+'/api/songs',{method:'POST',body:JSON.stringify({id:'one',title:'New title'})});
 assert.equal((await saveSong(ctx)).status,200);
 const updated=JSON.parse(await (await ctx.env.FILES.get('data/songs.json')).text());assert.equal(updated[0].downloadable,false);assert.ok(ctx.writes.some(key=>key.startsWith('data/backups/')));
 ctx.request=new Request(origin+'/api/download?id=one');assert.equal((await download(ctx)).status,403);
});
test('non-boolean download settings are rejected before storage is written',async()=>{
 for(const value of ['false',0,null,{}]){const ctx=setup(song);ctx.data.admin={id:'admin'};ctx.request=new Request(origin+'/api/songs',{method:'POST',body:JSON.stringify({id:'one',downloadable:value})});assert.equal((await saveSong(ctx)).status,400);assert.deepEqual(ctx.writes,[]);}
});
