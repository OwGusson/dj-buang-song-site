import test from 'node:test';
import assert from 'node:assert/strict';
import {requestPayload,messagePayload} from '../src/site2/payloads.js';
const form={name:'  Listener  ',title:'  Birthday song  ',email:'',message:'  A story about friendship.  '};
test('request submissions default to private and pending and accept no elevated fields',()=>{
 const value=requestPayload({...form,status:'done',linked_song_id:'private-id',notify:true});
 assert.deepEqual(value,{requester_name:'Listener',song_name:'Birthday song',details:'A story about friendship.',email:'',notify:false,delivery:'private',linked_song_id:'',status:'pending'});
});
test('public delivery requires an explicit choice and does not add public contact fields',()=>{
 const value=requestPayload({...form,private:false,email:'listener@example.com'});assert.equal(value.delivery,'public');assert.equal(value.email,'listener@example.com');assert.equal(value.notify,false);
});
test('messages always enter the private inbox as new',()=>{
 assert.deepEqual(messagePayload({...form,status:'read'}),{sender_name:'Listener',sender_email:'',message:'A story about friendship.',status:'new'});
});
test('empty required data, malformed email and excessive text are rejected before submission',()=>{
 for(const patch of [{name:' '},{title:' '},{message:''},{email:'wrong'},{message:'x'.repeat(10001)},{name:'x'.repeat(201)}])assert.throws(()=>requestPayload({...form,...patch}));
});
