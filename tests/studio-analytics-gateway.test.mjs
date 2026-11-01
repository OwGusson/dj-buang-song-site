import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAudienceQueryParams,buildEventsQueryParams} from '../functions/api/studio-data.js';

test('dated Studio events include legacy and public rows while excluding administrator and QA rows by default',()=>{
 const params=buildEventsQueryParams('2026-10-26T00:00:00Z','2026-11-01T12:00:00Z',1000,false);
 assert.equal(params.get('traffic_scope'),'in.(legacy,public)');
 assert.equal(params.has('measurement_version'),false);
 assert.equal(params.getAll('created_at').length,2);
 assert.equal(params.get('limit'),'1000');
 assert.equal(params.get('offset'),'1000');
});

test('Studio only includes marked QA rows when explicitly requested and never includes admin scope',()=>{
 const params=buildEventsQueryParams('2026-10-26T00:00:00Z','2026-11-01T12:00:00Z',0,true);
 assert.equal(params.get('traffic_scope'),'in.(legacy,public,qa)');
 assert.equal(params.get('traffic_scope').includes('admin'),false);
 assert.equal(params.has('measurement_version'),false);
});

test('new tab sessions and legacy network hashes use disjoint event queries',()=>{
 const start='2026-10-26T00:00:00Z',end='2026-11-01T12:00:00Z';
 const sessions=buildAudienceQueryParams(start,end,0,false,'sessions');
 const legacy=buildAudienceQueryParams(start,end,0,false,'legacy-network');
 assert.equal(sessions.get('measurement_version'),'eq.2');
 assert.equal(sessions.get('traffic_scope'),'eq.public');
 assert.equal(sessions.get('select'),'song_id,session_id,created_at');
 assert.equal(legacy.get('measurement_version'),'is.null');
 assert.equal(legacy.get('traffic_scope'),'eq.legacy');
 assert.equal(legacy.get('select'),'song_id,listener_id,created_at');
 assert.equal(legacy.get('session_id'),null);
});
