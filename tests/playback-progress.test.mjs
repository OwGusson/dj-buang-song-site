import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackProgress,observePlayback,playbackFinished,resetPlaybackSample} from '../shared/playback-progress.js';

test('milestones count only media time that plausibly advanced while playing',()=>{
 const state=createPlaybackProgress(100);
 resetPlaybackSample(state,{mediaSeconds:0,wallSeconds:0});
 assert.deepEqual(observePlayback(state,{mediaSeconds:25,wallSeconds:25}),['play_25']);
 assert.deepEqual(observePlayback(state,{mediaSeconds:50,wallSeconds:50}),['play_50']);
 assert.deepEqual(observePlayback(state,{mediaSeconds:75,wallSeconds:75}),['play_75']);
 assert.deepEqual(observePlayback(state,{mediaSeconds:95,wallSeconds:95}),[]);
 assert.equal(playbackFinished(state),true);
});

test('seeking and repeated time updates do not inflate listened-through milestones',()=>{
 const state=createPlaybackProgress(100);
 resetPlaybackSample(state,{mediaSeconds:0,wallSeconds:0});
 assert.deepEqual(observePlayback(state,{mediaSeconds:10,wallSeconds:10}),[]);
 resetPlaybackSample(state,{mediaSeconds:90,wallSeconds:11,seeking:true});
 resetPlaybackSample(state,{mediaSeconds:90,wallSeconds:12,seeking:false});
 assert.deepEqual(observePlayback(state,{mediaSeconds:90,wallSeconds:13}),[]);
 assert.equal(state.listenedSeconds,10);
 assert.equal(playbackFinished(state),false);
 assert.deepEqual(observePlayback(state,{mediaSeconds:95,wallSeconds:18}),[]);
 assert.equal(playbackFinished(state),false);
});
