import {mountConversationPlayer} from './conversation-player';
import {finishedSongSupportHint} from './finished-song-support';
import {openSupport} from './support';
import {listener,contactConfiguration,listenerRequest,listenerAction} from './listener';
import {mountTurnstile} from './turnstile';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
let generation=0,widget=null,playerCleanup=null;
function cleanup(){generation++;widget?.destroy();widget=null;playerCleanup?.();playerCleanup=null;}
function display(modal,html){cleanup();modal(html);$('#modal').dataset.listener='true';}
function failure(message){const target=$('#contact-error');if(target)target.textContent=message;}
async function captcha(selector,config){widget?.destroy();widget=await mountTurnstile($(selector),config.siteKey);}
async function requireListener(modal,next){
 const {data:{session}}=await listener.auth.getSession();
 if(session?.user?.email_confirmed_at){await next();return;}
 let config;try{config=await contactConfiguration();}catch{config={enabled:false,siteKey:''};}
 display(modal,`<div class="eyebrow">YOUR PRIVATE DJ-BUANG INBOX</div><h2>Let’s keep it between us.</h2>${config.testMode?'<p class="studio-note">Restricted messaging test · invited test accounts only.</p>':''}<p>Use a nickname and verify your email to send messages, request songs, and follow the conversation. Your email and story are not published.</p><form id="listener-email"><label class="field">Your email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><div id="listener-captcha"></div><p id="contact-error" role="alert"></p>${!config.enabled?'<p class="studio-note">Private inbox sign-in is being set up. Email verification is not available in this preview yet.</p>':''}<button class="primary" ${!config.enabled?'disabled':''}>Email me a sign-in code →</button></form><p class="studio-help">No password or public profile needed. Please avoid sending passwords, identity documents, or payment details.</p>`);
 if(!config.enabled)return;
 const view=generation;
 try{await captcha('#listener-captcha',config);}catch(error){failure(error.message);return;}
 if(view!==generation)return;
 $('#listener-email').onsubmit=async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),email=form.elements.email.value.trim();button.disabled=true;failure('');
   try{
     const {error}=await listener.auth.signInWithOtp({email,options:{shouldCreateUser:!config.testMode,captchaToken:widget.token()}});widget?.reset();
     if(error)throw Error('We could not send a code. Please wait a minute and try again.');if(view!==generation)return;
     display(modal,`<div class="eyebrow">CHECK YOUR EMAIL</div><h2>Your private inbox awaits.</h2><p>Enter the code sent to ${esc(email)}. Check spam if it hasn’t arrived.</p><form id="listener-code"><label class="field">Email code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required></label><p id="contact-error" role="alert"></p><button class="primary">Verify and continue →</button></form><button class="text-button" id="other-email">Use another email / resend</button>`);
     $('#other-email').onclick=()=>requireListener(modal,next);
     $('#listener-code').onsubmit=async codeEvent=>{codeEvent.preventDefault();const f=codeEvent.currentTarget,b=f.querySelector('button');b.disabled=true;try{const {error}=await listener.auth.verifyOtp({email,token:f.elements.code.value,type:'email'});f.elements.code.value='';if(error)throw Error('That code is invalid or expired. Please request a fresh one.');await next();}catch(error){failure(error.message);b.disabled=false;}};
   }catch(error){widget?.reset();failure(error.message);button.disabled=false;}
 };
}
export async function openContact(kind,modal){await requireListener(modal,()=>compose(kind,modal));}
async function compose(kind,modal){
 const config=await contactConfiguration();
 if(!config.enabled){display(modal,'<h2>Private inbox coming soon.</h2><p>Verification and message delivery are still being configured.</p>');return;}
 const request=kind==='request';
 display(modal,`<div class="eyebrow">${request?'YOUR STORY. YOUR SOUND.':'LET’S TALK'}</div><h2>${request?'Request a song':'Send a message'}</h2><form id="conversation-compose"><label class="field">Nickname<input name="nickname" autocomplete="nickname" maxlength="100" required></label><label class="field">${request?'Working title or occasion':'Subject'}<input name="title" maxlength="300" required></label><label class="field">${request?'Tell me your idea':'Your message'}<textarea name="body" maxlength="10000" required></textarea></label>${request?'<label class="field"><input type="checkbox" name="publish_song">DJ-Buang may publish the finished song</label><label class="field"><input type="checkbox" name="credit_name">DJ-Buang may credit my nickname</label><p class="studio-help">Both are optional. Your email and conversation remain private either way. Avoid including private details in a song you want published.</p>':'<p class="studio-help">Your conversation stays private between you and DJ-Buang.</p>'}<div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><div id="compose-captcha"></div><p id="contact-error" role="alert"></p><p class="studio-help">Two active song requests and five new conversations per day. Replies have a 30-second cooldown.</p><button class="primary">Send ${request?'request':'message'} →</button></form><button class="text-button" id="my-inbox">My conversations ↗</button>`);
 $('#my-inbox').onclick=()=>openMyConversations(modal);const view=generation;
 try{await captcha('#compose-captcha',config);}catch(error){failure(error.message);return;}if(view!==generation)return;
 $('#conversation-compose').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;if(form.elements.website.value)return;const button=form.querySelector('button');button.disabled=true;try{const data={kind,nickname:form.elements.nickname.value.trim(),title:form.elements.title.value.trim(),body:form.elements.body.value.trim(),publish_song:request&&form.elements.publish_song.checked,credit_name:request&&form.elements.credit_name.checked};const created=await listenerAction('create',data,widget.token());widget?.reset();await showThread(created.id,modal);}catch(error){widget?.reset();failure(error.message);button.disabled=false;}};
}
export async function openMyConversations(modal){
 await requireListener(modal,async()=>{
   display(modal,'<h2>Your conversations</h2><p>Loading your private inbox…</p>');const view=generation;
   try{
     const data=await listenerRequest('/api/conversations');if(view!==generation)return;
     display(modal,`<div class="eyebrow">ONLY YOU AND DJ-BUANG</div><h2>Your conversations.</h2><div class="conversation-list">${data.threads.map(t=>`<button class="conversation-summary" data-thread="${esc(t.id)}"><span><strong>${esc(t.title)}</strong><small>${t.kind==='request'?'Song request':'Message'} · ${esc(t.status.replaceAll('_',' '))}</small></span><span>↗</span></button>`).join('')||'<p>No conversations yet. Start with a message or a song idea.</p>'}</div><div class="detail-actions"><button class="primary" id="new-request">Request a song +</button><button class="outline" id="new-message">Send a message +</button><button class="text-button" id="listener-signout">Sign out</button></div>`);
     document.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>showThread(b.dataset.thread,modal));$('#new-request').onclick=()=>openContact('request',modal);$('#new-message').onclick=()=>openContact('message',modal);
     $('#listener-signout').onclick=async()=>{const {error}=await listener.auth.signOut();if(!error){cleanup();$('#modal').close();}};
   }catch(error){if(view===generation)display(modal,`<h2>Inbox unavailable</h2><p>${esc(error.message)}</p>`);}
 });
}
async function showThread(id,modal){
 display(modal,'<h2>Your conversation</h2><p>Loading…</p>');const view=generation;
 try{
   const [{thread:t,posts},config]=await Promise.all([listenerRequest('/api/conversations?id='+encodeURIComponent(id)),contactConfiguration()]);if(view!==generation)return;
   let finishedSong=null;if(t.kind==='request'&&t.status==='done'&&t.linked_song_id){try{finishedSong=await listenerRequest('/api/conversation-song?id='+encodeURIComponent(id));}catch{/* Linked media stays unavailable until authorized and ready. */}}if(view!==generation)return;
   display(modal,`<button class="text-button" id="inbox-back">← My conversations</button><div class="eyebrow">PRIVATE · ${esc(t.status.replaceAll('_',' '))}</div><h2>${esc(t.title)}</h2><div class="conversation-posts">${posts.map(p=>`<article class="conversation-post ${p.author_role==='artist'?'artist-reply':''}"><strong>${p.author_role==='artist'?'DJ-Buang':esc(t.nickname)}</strong><time>${esc(new Date(p.created_at).toLocaleString())}</time><p>${esc(p.body)}</p></article>`).join('')}</div>${finishedSong?'<aside class="finished-song-support" id="conversation-song"></aside>':t.linked_song_id?'<p class="studio-help">DJ-Buang has linked a song. Playback will appear here when it is ready.</p>':''}${finishedSongSupportHint(t,config.supportEnabled)}${t.kind==='request'?`<details class="consent-panel"><summary>Song sharing preferences</summary><form id="consent-form"><label class="field"><input type="checkbox" name="publish_song" ${t.publish_song?'checked':''}>Allow publishing the finished song</label><label class="field"><input type="checkbox" name="credit_name" ${t.credit_name?'checked':''}>Allow crediting my nickname</label><p class="studio-help">Changing this does not recall audio already published or downloaded.</p><button class="outline">Save preferences</button></form></details>`:''}${t.status==='closed'||t.blocked?'<p>This conversation is closed to new replies.</p>':'<form id="reply-form"><label class="field">Your reply<textarea name="body" maxlength="10000" required></textarea></label><button class="primary">Send reply →</button></form>'}<div id="reply-captcha"></div><p id="contact-error" role="alert"></p>`);
   if(finishedSong){const playerView=generation;playerCleanup=mountConversationPlayer($('#conversation-song'),{id,song:finishedSong,esc,isCurrent:()=>playerView===generation});}
   $('#inbox-back').onclick=()=>openMyConversations(modal);
   if($('#request-support'))$('#request-support').onclick=()=>{cleanup();openSupport(modal);};
   if(!$('#reply-form')&&!$('#consent-form'))return;
   await captcha('#reply-captcha',config);
   const send=async(action,data,button)=>{button.disabled=true;try{await listenerAction(action,{id,...data},widget.token());widget?.reset();await showThread(id,modal);}catch(error){widget?.reset();failure(error.message);button.disabled=false;}};
   if($('#reply-form'))$('#reply-form').onsubmit=event=>{event.preventDefault();send('reply',{body:event.currentTarget.elements.body.value.trim()},event.currentTarget.querySelector('button'));};
   if($('#consent-form'))$('#consent-form').onsubmit=event=>{event.preventDefault();send('consent',{publish_song:event.currentTarget.elements.publish_song.checked,credit_name:event.currentTarget.elements.credit_name.checked},event.currentTarget.querySelector('button'));};
 }catch(error){if(view===generation)display(modal,`<h2>Conversation unavailable</h2><p>${esc(error.message)}</p>`);}
}
document.querySelector('#modal').addEventListener('close',()=>{if(!$('#modal').open){cleanup();delete $('#modal').dataset.listener;}});
listener.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&$('#modal').dataset.listener==='true'){cleanup();$('#modal').close();}});
