import {json} from '../_lib/security.js';
import {contactConfig,verifiedContactUser,verifyTurnstile,actorHash,contactRpc,readContactBody} from '../_lib/contacts.js';
import {voiceConsent,validateVoiceFile,VOICE_MAX_BYTES,VOICE_BUCKET} from '../../shared/voice-samples.js';
import {voiceRpc,voiceBase,voiceHeaders,removeVoiceObject} from '../_lib/voice-samples.js';
async function authenticated(context){if(!contactConfig(context.env).enabled)return null;return verifiedContactUser(context);}
function sameOrigin(context){const origin=context.request.headers.get('Origin');return !origin||origin===new URL(context.request.url).origin;}
export async function onRequestGet(context){try{
 const user=await authenticated(context);if(!user)return json({error:'Verify your email to access voice samples.'},401);
 const params=new URL(context.request.url).searchParams;
 if(params.has('thread'))return json(await voiceRpc(context.env,user,'list',{thread_id:params.get('thread')}));
 const sample=await voiceRpc(context.env,user,'read',{id:params.get('id')});
 const response=await fetch(voiceBase(context.env)+'/storage/v1/object/authenticated/'+VOICE_BUCKET+'/'+sample.object_key,{headers:voiceHeaders(context.env),signal:AbortSignal.timeout(20000)});
 if(!response.ok)return json({error:'Recording unavailable.'},404);
 return new Response(response.body,{headers:{'Content-Type':sample.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="voice-'+sample.id+'.'+sample.object_key.split('.').pop()+'"'}});
 }catch(error){return json({error:'Voice sample unavailable or expired.'},error.status||503);}}
export async function onRequestPost(context){let createdThread=null,sample=null,user;try{
 if(!sameOrigin(context))return json({error:'Forbidden origin.'},403);user=await authenticated(context);if(!user)return json({error:'Verify your email before uploading.'},401);
 if(Number(context.request.headers.get('Content-Length'))>VOICE_MAX_BYTES+65536)return json({error:'Choose audio up to 10 MB.'},413);
 let size=0;const stream=context.request.body?.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.byteLength;if(size>VOICE_MAX_BYTES+65536)throw new RangeError('Upload too large');controller.enqueue(chunk);}}));
 if(!stream)return json({error:'Missing audio.'},400);
 let form;try{form=await new Response(stream,{headers:context.request.headers}).formData();}catch{return json({error:'Invalid or oversized upload.'},size>VOICE_MAX_BYTES+65536?413:400);}
 let data;try{data=JSON.parse(form.get('data'));}catch{return json({error:'Invalid upload details.'},400);}
 let consent,mime;try{consent=voiceConsent(data);mime=await validateVoiceFile(form.get('file'));}catch(error){return json({error:error.message},400);}
 if(!await verifyTurnstile(context,form.get('turnstileToken')))return json({error:'Please complete the bot check again.'},403);
 let threadId=data.thread_id;
 if(!threadId){const request=data.request;if(!request||request.kind!=='request')return json({error:'A song request is required.'},400);
 const safe=Object.fromEntries(['kind','title','body','nickname','publish_song','credit_name'].map(k=>[k,request[k]]));safe.email=user.email;
 for(const k of ['publish_song','credit_name'])if(typeof safe[k]!=='boolean')return json({error:'Invalid request choices.'},400);
 const response=await contactRpc(context.env,{p_user:user.id,p_admin:user.admin,p_action:'create',p_data:safe,p_actor:await actorHash(context)});
 if(!response.ok)return json({error:'The request could not be created. Check active-request limits and try again later.'},409);
 threadId=(await response.json()).id;createdThread=threadId;
 }
 const file=form.get('file');sample=await voiceRpc(context.env,user,'reserve',{thread_id:threadId,...consent,mime,bytes:file.size});
 const stored=await fetch(voiceBase(context.env)+'/storage/v1/object/'+VOICE_BUCKET+'/'+sample.object_key,{method:'POST',headers:{...voiceHeaders(context.env),'Content-Type':mime,'x-upsert':'false','Cache-Control':'no-store'},body:await file.arrayBuffer(),signal:AbortSignal.timeout(30000)});
 if(!stored.ok)throw Error('The recording could not be stored.');
 const result=await voiceRpc(context.env,user,'complete',{id:sample.id});return json({id:threadId,sample:result},201);
 }catch(error){if(sample&&user){try{await voiceRpc(context.env,user,'remove',{id:sample.id});await removeVoiceObject(context.env,sample.object_key);await voiceRpc(context.env,user,'deleted',{id:sample.id});}catch{/* Pending cleanup is retried by the maintenance job. */}}
 if(createdThread)return json({id:createdThread,voiceError:'Your request was saved, but the recording was not attached. You can retry from this conversation.'},201);
 return json({error:error.status?error.message:'The recording could not be attached. Please try again.'},error.status||503);
 }}
export async function onRequestDelete(context){try{
 if(!sameOrigin(context))return json({error:'Forbidden origin.'},403);const user=await authenticated(context);if(!user)return json({error:'Sign in to remove a recording.'},401);
 const data=await readContactBody(context.request),sample=await voiceRpc(context.env,user,'remove',{id:data.id});await removeVoiceObject(context.env,sample.object_key);await voiceRpc(context.env,user,'deleted',{id:sample.id});return json({ok:true});
 }catch(error){return json({error:'Removal could not finish. An expired or withdrawn recording cannot be played; cleanup will retry.'},error.status||503);}}
