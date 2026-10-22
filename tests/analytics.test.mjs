import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsWindow,summarizeAnalytics,readAnalyticsPages} from '../src/site2/analytics-model.js';
const now=new Date('2026-10-22T16:00:00Z');
const songs=[{id:'a',title:'A',albumId:'global-barangay'},{id:'b',title:'B'}];
const event=(song_id,event_type,created_at='2026-10-22T10:00:00Z')=>({song_id,event_type,created_at});
test('analytics periods use inclusive UTC calendar days and exclude future activity',()=>{
 assert.equal(analyticsWindow('today',now).start,'2026-10-22T00:00:00.000Z');
 assert.equal(analyticsWindow('week',now).start,'2026-10-16T00:00:00.000Z');
 assert.equal(analyticsWindow('month',now).start,'2026-09-23T00:00:00.000Z');
 assert.throws(()=>analyticsWindow('invalid',now));
 const result=summarizeAnalytics({songs,events:[event('a','play_start'),event('a','play_start','2026-10-21T23:59:59Z'),event('a','play_start','2026-10-22T16:00:00Z')],window:analyticsWindow('today',now)});
 assert.equal(result.totals.plays,1);assert.deepEqual(result.daily,[{day:'2026-10-22',plays:1}]);
});
test('period rankings exclude deleted songs, count starts separately from milestones and preserve zero days',()=>{
 const result=summarizeAnalytics({songs,totals:[{song_id:'a',plays:1000}],likes:[{song_id:'a',likes:9},{song_id:'deleted',likes:80}],events:[event('a','play_start'),event('a','play_25'),event('a','download_song'),event('b','download_lyrics'),event('deleted','play_start')],window:analyticsWindow('week',now)});
 assert.equal(result.totals.plays,1);assert.equal(result.totals.likes,9);assert.equal(result.totals.song_downloads,1);assert.equal(result.totals.lyrics_downloads,1);assert.equal(result.daily.length,7);assert.equal(result.daily[0].plays,0);
 assert.equal(result.albums.length,1);assert.equal(result.albums[0].plays,1);assert.equal(result.albums[0].tracks,1);
});
test('all-time counters are not double counted with dated chart activity',()=>{
 const result=summarizeAnalytics({songs,totals:[{song_id:'a',plays:42,song_downloads:2},{song_id:'deleted',plays:500}],events:[event('a','play_start')],window:analyticsWindow('all',now)});
 assert.equal(result.totals.plays,42);assert.equal(result.daily.reduce((sum,row)=>sum+row.plays,0),1);assert.equal(result.daily.length,90);
});
test('analytics pagination loads beyond first page and rejects errors or truncated ranges',async()=>{
 const calls=[];const rows=await readAnalyticsPages(()=>({range:async(from,to)=>{calls.push([from,to]);return {data:from===0?Array(1000).fill({}):[{}]};}}));assert.equal(rows.length,1001);assert.deepEqual(calls,[[0,999],[1000,1999]]);
 await assert.rejects(readAnalyticsPages(()=>({range:async()=>({error:{message:'denied'}})})),/could not be loaded/);
 await assert.rejects(readAnalyticsPages(()=>({range:async()=>({data:Array(1000).fill({})})})),/too much activity/);
});
