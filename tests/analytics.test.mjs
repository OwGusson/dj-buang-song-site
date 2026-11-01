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
test('each dated progress event is counted once per period',()=>{
 for(const period of ['today','week','month','all']){
  const window=analyticsWindow(period,now),playback='258a5950-c436-4b24-ae26-9c83e61011ee';
  const events=['play_25','play_50','play_75','play_finished'].flatMap((event_type,index)=>[
   {...event('a',event_type),id:index+1,measurement_version:2,playback_id:playback},
   {...event('a',event_type),id:index+1,measurement_version:2,playback_id:playback},
  ]);
  const result=summarizeAnalytics({songs,events,window});
  assert.deepEqual([result.totals.reached25,result.totals.reached50,result.totals.reached75,result.totals.finished],[1,1,1,1],period);
 }
});
test('new detail opens do not inherit legacy play-open counters',()=>{
 const result=summarizeAnalytics({songs,totals:[{song_id:'a',opens:100}],events:[{...event('a','song_detail_open'),id:1,measurement_version:2}],window:analyticsWindow('week',now)});
 assert.equal(result.totals.opens,1);
 assert.equal(result.totals.legacyOpens,0);
 const all=summarizeAnalytics({songs,totals:[{song_id:'a',opens:100}],events:[{...event('a','song_detail_open'),id:1,measurement_version:2}],window:analyticsWindow('all',now)});
 assert.equal(all.totals.opens,1);
 assert.equal(all.totals.legacyOpens,100);
});
test('retained legacy starts and downloads stay visible without mixing old progress or listener IDs with new sessions',()=>{
 const week=analyticsWindow('week',new Date('2026-11-01T12:00:00Z'));
 const legacyStarts=Array.from({length:76},(_,index)=>({...event('a','play_start',`2026-10-31T12:${String(index%60).padStart(2,'0')}:00Z`),id:index+1,traffic_scope:'legacy',listener_id:`old-network-${index%3}`}));
 const events=[...legacyStarts,
  {...event('a','play_start','2026-10-31T18:00:00Z'),id:2000,measurement_version:2,traffic_scope:'public',session_id:'new-tab-a'},
  {...event('a','play_25','2026-10-31T18:01:00Z'),id:2001,measurement_version:2,traffic_scope:'public',playback_id:'playback-a'},
  {...event('a','play_finished','2026-10-31T18:02:00Z'),id:2007,measurement_version:2,traffic_scope:'public',playback_id:'playback-a'},
  {...event('a','play_75','2026-10-31T18:02:00Z'),id:2002,traffic_scope:'legacy'},
  {...event('a','download_song','2026-10-31T18:03:00Z'),id:2003,traffic_scope:'legacy'},
  {...event('a','download_lyrics','2026-10-31T18:04:00Z'),id:2004,measurement_version:2,traffic_scope:'public'},
  {...event('a','play_start','2026-10-31T18:05:00Z'),id:2005,measurement_version:2,traffic_scope:'admin',session_id:'admin-tab'},
  {...event('a','play_50','2026-10-31T18:06:00Z'),id:2006,measurement_version:2,traffic_scope:'qa',playback_id:'qa-playback'},
 ];
 const audience={uniqueListeners:1,returningListeners:0,trackListeners:{a:1},legacyNetworkListeners:3,trackLegacyNetworkListeners:{a:3}};
 const result=summarizeAnalytics({songs,events,audience,window:week});
 assert.equal(result.totals.periodPlays,77);
 assert.equal(result.totals.song_downloads,1);
 assert.equal(result.totals.lyrics_downloads,1);
 assert.equal(result.totals.reached25,1);
 assert.equal(result.totals.reached75,0,'legacy position-based progress is not a listened-time milestone');
 assert.equal(result.totals.reached50,0,'QA is excluded by default');
 assert.equal(result.tracks.find(row=>row.song.id==='a').uniqueListeners,1);
 assert.equal(result.tracks.find(row=>row.song.id==='a').legacyNetworkListeners,3);
 assert.equal(result.tracks.find(row=>row.song.id==='a').measuredPlays,1);
 assert.equal(result.tracks.find(row=>row.song.id==='a').completionRate,1,'completion uses the newly measured start denominator, not combined legacy starts');
 assert.equal(result.tracks.find(row=>row.song.id==='a').replaysPerListener,1,'starts per session uses newly measured starts only');
 const qaIncluded=summarizeAnalytics({songs,events,audience,window:week,includeQA:true});
 assert.equal(qaIncluded.totals.periodPlays,77,'QA milestone events do not count as play starts');
 assert.equal(qaIncluded.totals.reached50,1);
});
test('analytics pagination loads beyond first page and rejects errors or truncated ranges',async()=>{
 const calls=[];const rows=await readAnalyticsPages(()=>({range:async(from,to)=>{calls.push([from,to]);return {data:from===0?Array(1000).fill({}):[{}]};}}));assert.equal(rows.length,1001);assert.deepEqual(calls,[[0,999],[1000,1999]]);
 await assert.rejects(readAnalyticsPages(()=>({range:async()=>({error:{message:'denied'}})})),/could not be loaded/);
 await assert.rejects(readAnalyticsPages(()=>({range:async()=>({data:Array(1000).fill({})})})),/too much activity/);
});
