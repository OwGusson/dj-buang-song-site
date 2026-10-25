// Studio authorization is independent of listener sessions. Remembered-device tokens are HttpOnly; only their hashes are stored.
export const IDLE_MS = 30 * 60 * 1000;
export const MAX_MS = 12 * 60 * 60 * 1000;
export const TRUST_MS = 7 * 24 * 60 * 60 * 1000;
export const DEVICE_COOKIE = '__Host-dj-studio-device';
export function cookie(request, name) {
 return request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1) || '';
}
export async function digest(value) {
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function key(admin) {
 if (!admin.authClaims?.session_id) return null;
 return 'data/studio-sessions/'+await digest(admin.id+':'+admin.authClaims.session_id)+'.json';
}
async function read(env, path) {
 if (!path || !env.FILES) return null;
 const object=await env.FILES.get(path);return object ? JSON.parse(await object.text()) : null;
}
export function isActive(record, now=Date.now()) {
 return !!record && !record.revoked && Number.isFinite(record.started) && Number.isFinite(record.active) && now>=record.started && now>=record.active && now-record.started<MAX_MS && now-record.active<IDLE_MS;
}
export async function studioSession(context, admin) {
 const path=await key(admin);if(await read(context.env,path?.replace('studio-sessions/','studio-revoked/')))return null;
 const record=await read(context.env,path);
 return record?.user===admin.id && isActive(record) ? record : null;
}
export async function sessionBlocked(context,admin) {
 const path=await key(admin);if(!path)return true;
 if(await read(context.env,path.replace('studio-sessions/','studio-revoked/')))return true;
 const record=await read(context.env,path);return !!record && !isActive(record);
}
export async function trustedDevice(context, admin) {
 const token=cookie(context.request,DEVICE_COOKIE);
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const record=await read(context.env,'data/studio-devices/'+await digest(token)+'.json');
 if(!record || record.user!==admin.id || !Number.isFinite(record.expires) || record.expires<=Date.now())return null;
 // Removing/replacing the authenticator invalidates its remembered devices.
 if(!admin.factors?.some(f=>f.id===record.factor && f.status==='verified' && f.factor_type==='totp'))return null;
 return record;
}
export function freshMethod(admin, method, now=Date.now()) {
 return admin.authClaims?.amr?.some(v=>v.method===method && Number.isFinite(v.timestamp) && now-v.timestamp*1000>=-30000 && now-v.timestamp*1000<180000);
}
export async function beginSession(context, admin) {
 const path=await key(admin);if(!path || !context.env.FILES)throw Error('Studio session storage unavailable');
 if(await read(context.env,path.replace('studio-sessions/','studio-revoked/')))return null;
 const old=await read(context.env,path);
 // An expired/revoked login cannot restart itself using an old access token.
 if(old)return isActive(old)&&old.user===admin.id ? old : null;
 if(!freshMethod(admin,'password') && !(admin.authClaims.aal==='aal2' && freshMethod(admin,'totp')))return null;
 const now=Date.now(),record={user:admin.id,started:now,active:now};
 await context.env.FILES.put(path,JSON.stringify(record));return record;
}
export async function touchSession(context,admin) {
 const record=await studioSession(context,admin);if(!record)return null;
 record.active=Date.now();await context.env.FILES.put(await key(admin),JSON.stringify(record));return record;
}
export async function endSession(context, admin) {
 const path=await key(admin);if(path && context.env.FILES)await context.env.FILES.put(path.replace('studio-sessions/','studio-revoked/'),JSON.stringify({revoked:true}));
}
export async function rememberDevice(context,admin) {
 if(admin.authClaims?.aal!=='aal2' || !freshMethod(admin,'totp'))return null;
 const factor=admin.factors?.find(f=>f.status==='verified' && f.factor_type==='totp');if(!factor)return null;
 const token=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
 await forgetDevice(context);
 await context.env.FILES.put('data/studio-devices/'+await digest(token)+'.json',JSON.stringify({user:admin.id,factor:factor.id,expires:Date.now()+TRUST_MS}));
 return token;
}
export async function forgetDevice(context) {
 const token=cookie(context.request,DEVICE_COOKIE);
 if(/^[a-f0-9]{64}$/.test(token))await context.env.FILES.delete('data/studio-devices/'+await digest(token)+'.json');
}
export function deviceCookie(token) {
 return DEVICE_COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(token?TRUST_MS/1000:0);
}
export function sessionInfo(record) {
 return {idleExpiresAt:record.active+IDLE_MS,expiresAt:record.started+MAX_MS};
}
