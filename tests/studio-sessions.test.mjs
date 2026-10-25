import test from 'node:test';
import assert from 'node:assert/strict';
import {getAdmin} from '../functions/_lib/security.js';
import {verifiedContactUser} from '../functions/_lib/contacts.js';
import {IDLE_MS,MAX_MS,TRUST_MS,DEVICE_COOKIE,beginSession,studioSession,touchSession,endSession,rememberDevice,trustedDevice,forgetDevice,deviceCookie} from '../functions/_lib/studio-session.js';
import {onRequestPost as start,onRequestGet as status,onRequestDelete as logout} from '../functions/api/session.js';
import {onRequestGet as rows,onRequestPost as update} from '../functions/api/studio-data.js';
const origin='https://dj-buang.com',now=1792920000000;
function setup(t,{aal='aal2',method='totp',age=0,id='admin',session='session-1'}={}){
 t.mock.method(Date,'now',()=>now);const objects=new Map();
 const user={id,email:'admin@example.test',email_confirmed_at:'now',app_metadata:{role:'admin'},factors:[{id:'factor-1',factor_type:'totp',status:'verified'}]};
 const claims={aal,session_id:session,amr:[{method,timestamp:(now-age)/1000}]};
 const token='e30.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.auth-validated';
 const admin={...user,authClaims:claims,mfaVerified:aal==='aal2'};
 const ctx={request:new Request(origin+'/api/session',{headers:{Authorization:'Bearer '+token}}),data:{admin},env:{SUPABASE_URL:'https://auth.example',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only',FILES:{async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},async put(key,value){objects.set(key,value);},async delete(key){objects.delete(key);}}}};
 t.mock.method(globalThis,'fetch',async()=>Response.json(user));
 return {ctx,admin,user,objects,token,setCookie(value){ctx.request=new Request(ctx.request,{headers:{Authorization:'Bearer '+token,Cookie:DEVICE_COOKIE+'='+value}});}};
}

test('MFA alone cannot bypass the new lease; fresh verification can start one',async t=>{
 const {ctx,admin}=setup(t);assert.equal(await getAdmin(ctx),null);
 assert.ok(await beginSession(ctx,admin));assert.ok(await getAdmin(ctx));
});
test('idle and absolute limits enforced on server including refreshed access tokens',async t=>{
 const {ctx,admin,objects}=setup(t);await beginSession(ctx,admin);
 for(const record of [{user:'admin',started:now-IDLE_MS,active:now-IDLE_MS},{user:'admin',started:now-MAX_MS,active:now}]){
  objects.set([...objects.keys()][0],JSON.stringify(record));assert.equal(await getAdmin(ctx),null);assert.equal(await beginSession(ctx,admin),null);
 }
});
test('activity extends idle deadline but never the absolute deadline',async t=>{
 const {ctx,admin}=setup(t);const record=await beginSession(ctx,admin);t.mock.method(Date,'now',()=>now+60000);
 const touched=await touchSession(ctx,admin);assert.equal(touched.started,record.started);assert.equal(touched.active,now+60000);
});
test('stale verification cannot create a new lease or remember a device',async t=>{
 const {ctx,admin}=setup(t,{age:181000});assert.equal(await beginSession(ctx,admin),null);assert.equal(await rememberDevice(ctx,admin),null);
});
test('remembering requires fresh MFA, stores only a hash, and uses a protected cookie',async t=>{
 const {ctx,admin,objects,setCookie}=setup(t);const token=await rememberDevice(ctx,admin);assert.match(token,/^[a-f0-9]{64}$/);
 assert.ok([...objects.keys()].every(key=>!key.includes(token)));assert.ok([...objects.values()].every(value=>!value.includes(token)));
 assert.match(deviceCookie(token),/^__Host-.*Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
 setCookie(token);assert.ok(await trustedDevice(ctx,admin));t.mock.method(Date,'now',()=>now+TRUST_MS);assert.equal(await trustedDevice(ctx,admin),null);
});
test('remembered device permits password login, never an arbitrary browser flag',async t=>{
 const s=setup(t);const token=await rememberDevice(s.ctx,s.admin);s.setCookie(token);
 s.admin.authClaims={aal:'aal1',session_id:'password-session',amr:[{method:'password',timestamp:now/1000}]};
 const passwordToken='e30.'+Buffer.from(JSON.stringify(s.admin.authClaims)).toString('base64url')+'.valid';
 s.ctx.request=new Request(origin+'/api/session',{headers:{Authorization:'Bearer '+passwordToken,Cookie:DEVICE_COOKIE+'='+token}});
 await beginSession(s.ctx,s.admin);assert.ok(await getAdmin(s.ctx));
 s.ctx.request=new Request(s.ctx.request,{headers:{Authorization:'Bearer '+passwordToken,Cookie:'djbuang_admin_logged_in=true'}});assert.equal(await getAdmin(s.ctx),null);
});
test('remembered devices are bound to user and authenticator; forgetting revokes them',async t=>{
 const s=setup(t);const token=await rememberDevice(s.ctx,s.admin);s.setCookie(token);
 assert.equal(await trustedDevice(s.ctx,{...s.admin,id:'another-user'}),null);
 assert.equal(await trustedDevice(s.ctx,{...s.admin,factors:[]}),null);
 await forgetDevice(s.ctx);assert.equal(await trustedDevice(s.ctx,s.admin),null);
});
test('revocation wins even if a delayed heartbeat rewrites the lease',async t=>{
 const s=setup(t);await beginSession(s.ctx,s.admin);const [key,value]=[...s.objects][0];await endSession(s.ctx,s.admin);s.objects.set(key,value);
 assert.equal(await studioSession(s.ctx,s.admin),null);assert.equal(await beginSession(s.ctx,s.admin),null);
});
test('session endpoint refuses password-only untrusted logins and cross-origin requests',async t=>{
 const s=setup(t,{aal:'aal1',method:'password'});s.ctx.request=new Request(s.ctx.request,{method:'POST',body:'{}'});assert.equal((await start(s.ctx)).status,401);
 s.ctx.data.admin.mfaVerified=true;s.ctx.request=new Request(s.ctx.request,{headers:{Origin:'https://evil.example'}});assert.equal((await start(s.ctx)).status,403);
});
test('session status and activity expose deadlines, signout revokes lease and forgets cookie',async t=>{
 const s=setup(t);s.ctx.request=new Request(s.ctx.request,{method:'POST',body:JSON.stringify({rememberDevice:true})});
 const response=await start(s.ctx);assert.equal(response.status,200);assert.equal((await response.json()).expiresAt,now+MAX_MS);assert.match(response.headers.get('Set-Cookie'),/__Host-dj-studio-device/);
 assert.equal((await status(s.ctx)).status,200);s.ctx.request=new Request(origin+'/api/session?forget=1',{method:'DELETE'});assert.equal((await logout(s.ctx)).status,200);assert.equal(await studioSession(s.ctx,s.admin),null);
});
test('administrator conversations require a valid Studio lease, listeners do not',async t=>{
 const s=setup(t);assert.equal(await verifiedContactUser(s.ctx),null);await beginSession(s.ctx,s.admin);assert.equal((await verifiedContactUser(s.ctx)).admin,true);
});
test('Studio gateway rejects unauthenticated, unknown, and injection-shaped queries',async t=>{
 const s=setup(t);s.ctx.request=new Request(origin+'/api/studio-data?kind=messages');assert.equal((await rows(s.ctx)).status,401);
 s.ctx.request=new Request(origin+'/api/studio-data?kind=private_users',{headers:{Authorization:'Bearer '+s.token}});await beginSession(s.ctx,s.admin);assert.equal((await rows(s.ctx)).status,400);
});
test('Studio gateway bounds analytics dates/pagination and allowlists updates',async t=>{
 const s=setup(t);await beginSession(s.ctx,s.admin);
 for(const query of ['kind=events&start=bad&end=2026','kind=likes&offset=-1','kind=messages&offset=50001']){s.ctx.request=new Request(origin+'/api/studio-data?'+query,{headers:{Authorization:'Bearer '+s.token}});assert.equal((await rows(s.ctx)).status,400);}
 s.ctx.request=new Request(origin+'/api/studio-data',{method:'POST',headers:{Authorization:'Bearer '+s.token},body:JSON.stringify({kind:'messages',id:1,patch:{email:'leak@example.test'}})});assert.equal((await update(s.ctx)).status,400);
});
test('Studio gateway forwards only fixed selected fields, valid filters and server credentials',async t=>{
 const s=setup(t);await beginSession(s.ctx,s.admin);let forwarded;
 t.mock.method(globalThis,'fetch',async(url,options)=>{if(url.endsWith('/user'))return Response.json(s.user);forwarded={url,options};return Response.json([{song_id:'a',likes:1}]);});
 s.ctx.request=new Request(origin+'/api/studio-data?kind=likes',{headers:{Authorization:'Bearer '+s.token}});assert.equal((await rows(s.ctx)).status,200);assert.match(forwarded.url,/song_likes\?select=song_id%2Clikes/);assert.equal(forwarded.options.headers.apikey,'server-only');
});
