import test from 'node:test';
import assert from 'node:assert/strict';
import {finishedSongSupportHint} from '../src/site2/finished-song-support.js';
test('support hint is limited to completed linked song requests and follows checkout release setting',()=>{
 const request={kind:'request',status:'done',linked_song_id:'song-id'};
 for(const changed of [{...request,status:'pending'},{...request,status:'in_progress'},{...request,kind:'message'},{...request,linked_song_id:null}])assert.equal(finishedSongSupportHint(changed,true),'');
 const held=finishedSongSupportHint(request,false);assert.match(held,/better music tools and software/);assert.match(held,/completely optional/);assert.ok(!held.includes('request-support'));
 assert.match(finishedSongSupportHint(request,true),/id="request-support"/);
});
