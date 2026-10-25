import {json,readLimitedText} from '../_lib/security.js';
import {studioSession,beginSession,touchSession,endSession,rememberDevice,forgetDevice,deviceCookie,sessionInfo} from '../_lib/studio-session.js';
function responseFor(context,record) {
 const response=json({authenticated:true,...sessionInfo(record)});
 const token=context.request.headers.get('Authorization').slice(7);
 response.headers.append('Set-Cookie',`__Secure-dj-media=${token}; Path=/files/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`);
 return response;
}
export async function onRequestGet(context) {
 const admin=context.data.admin;if(!admin)return json({error:'Administrator sign-in required'},401);
 if(!admin.mfaVerified)return json({authenticated:false,mfaRequired:true});
 const record=await studioSession(context,admin);
 return record?responseFor(context,record):json({authenticated:false,reauthRequired:true});
}
export async function onRequestPost(context) {
 const admin=context.data.admin;if(!admin?.mfaVerified)return json({error:'Authenticator verification required'},401);
 const origin=context.request.headers.get('Origin');if(origin && origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin'},403);
 let body;try{body=JSON.parse(await readLimitedText(context.request,1024));}catch{return json({error:'Invalid session request'},400);}
 const record=body.activity===true?await touchSession(context,admin):await beginSession(context,admin);
 if(!record)return json({error:'Your Studio session expired. Sign in again.'},401);
 const response=responseFor(context,record);
 if(body.rememberDevice===true){
  const token=await rememberDevice(context,admin);
  if(!token)return json({error:'Enter a fresh authenticator code to remember this device.'},403);
  response.headers.append('Set-Cookie',deviceCookie(token));
 }
 return response;
}
export async function onRequestDelete(context) {
 const origin=context.request.headers.get('Origin');if(origin && origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin'},403);
 if(!context.data.admin)return json({error:'Administrator sign-in required'},401);
 await endSession(context,context.data.admin);
 const response=json({success:true});
 response.headers.append('Set-Cookie','__Secure-dj-media=; Path=/files/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
 if(new URL(context.request.url).searchParams.get('forget')==='1'){
  await forgetDevice(context);response.headers.append('Set-Cookie',deviceCookie(''));
 }
 return response;
}
