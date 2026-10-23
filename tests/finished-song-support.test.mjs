import test from 'node:test';
import assert from 'node:assert/strict';
import {finishedSongSupportHint} from '../src/site2/finished-song-support.js';
test('completed linked requests always offer the support window while checkout keeps its separate release gate',()=>{
 const request={kind:'request',status:'done',linked_song_id:'song-id'};
 for(const changed of [{...request,status:'pending'},{...request,status:'in_progress'},{...request,kind:'message'},{...request,linked_song_id:null}])assert.equal(finishedSongSupportHint(changed,true),'');
 const held=finishedSongSupportHint(request,false);assert.match(held,/better music tools and software/);assert.match(held,/completely optional/);assert.match(held,/id="request-support"/);
 assert.match(finishedSongSupportHint(request,true),/id="request-support"/);
});
