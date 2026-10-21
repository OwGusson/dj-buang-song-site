import { renderStudioConversations } from './studio-conversations';
import { contactConfiguration } from './listener';
import { mountTurnstile } from './turnstile';
import { supabase } from '../supabase';
import { apiFetch, verifyAdmin } from '../adminAuth';
import { authenticatorQrDataUrl } from '../authenticatorQr';
import { catalog, inbox, saveSong, deleteSong, updateInbox, uploadFile } from './data';

export function createStudio({modal,esc,toast,onCatalog}) {
 const content=document.querySelector('#modal-content');
 const dialog=document.querySelector('#modal');
 let authenticated=false, epoch=0, tab='songs', state=null, factor=null, loginCaptcha=null;
 const clear=()=>{epoch++;authenticated=false;state=null;factor=null;content.onchange=null;if(dialog.dataset.studio==='true'){dialog.close();content.replaceChildren();delete dialog.dataset.studio;}onCatalog();};
 supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clear();});
 const show=html=>{modal(html);dialog.dataset.studio='true';};
 async function run(button, action) {
   button.disabled=true;
   try {await action();}catch(error){toast(error.message||'The action could not be completed.');}finally{button.disabled=false;}
 }
 async function authenticate(){
   const response=await apiFetch('/api/session');
   if(!response.ok)throw new Error('Sign in with your administrator account.');
   const access=await response.json();
   if(access.authenticated){authenticated=true;return true;}
   const {data,error}=await supabase.auth.mfa.listFactors();if(error)throw error;
   const verified=data.totp.find(f=>f.status==='verified');
   if(verified){factor={id:verified.id};return false;}
   for(const f of data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){const {error}=await supabase.auth.mfa.unenroll({factorId:f.id});if(error)throw error;}
   const result=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'DJ-Buang admin'});
   if(result.error)throw result.error;factor={id:result.data.id,qr:authenticatorQrDataUrl(result.data.totp.qr_code),secret:result.data.totp.secret};return false;
 }
 function mfa(){
   show(`<div class="eyebrow">SECURE STUDIO · SECOND STEP</div><h2>Verify it’s you.</h2>${factor.qr?`<p>Scan this QR code with Google Authenticator or another authenticator app.</p><img class="mfa-qr" src="${esc(factor.qr)}" alt="Authenticator enrollment QR code"><details><summary>Can’t scan the code?</summary><p>Enter this setup key manually in your authenticator app:</p><code>${esc(factor.secret)}</code></details>`:'<p>Enter the six-digit code from your authenticator app.</p>'}<form id="mfa-form"><label class="field">Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p role="alert" id="auth-error"></p><button class="primary">Verify and open studio →</button></form>`);
   content.querySelector('form').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;run(form.querySelector('button'),async()=>{const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code:form.elements.code.value});if(error){content.querySelector('#auth-error').textContent='That code could not be verified. Try a fresh code.';return;}form.elements.code.value='';await verifyAdmin();authenticated=true;factor=null;await load();});};
 }
 async function login(){
   show('<div class="eyebrow">DJ-BUANG · SECURE STUDIO</div><h2>Welcome back.</h2><p>Sign in to manage songs, requests, and messages.</p><form id="login-form"><label class="field">Administrator email<input name="email" type="email" autocomplete="username" required></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label><p id="auth-error" role="alert"></p><button class="primary">Continue →</button></form><p><a href="/studio/classic">Account recovery and classic tools ↗</a></p>');
   let captchaRequired=false;
   const loginForm=content.querySelector('form'),submit=loginForm.querySelector('button');submit.disabled=true;
   try{const config=await contactConfiguration();captchaRequired=config.authCaptchaEnabled;if(captchaRequired){const holder=document.createElement('div');loginForm.insertBefore(holder,content.querySelector('#auth-error'));loginCaptcha=await mountTurnstile(holder,config.siteKey);}}catch{content.querySelector('#auth-error').textContent='Bot verification configuration could not load. Sign-in may be unavailable.';}finally{submit.disabled=false;}
   loginForm.onsubmit=event=>{event.preventDefault();const form=event.currentTarget;run(form.querySelector('button'),async()=>{const options=captchaRequired?{captchaToken:loginCaptcha?.token()}:undefined;const {error}=await supabase.auth.signInWithPassword({email:form.elements.email.value,password:form.elements.password.value,options});loginCaptcha?.reset();form.elements.password.value='';if(error){content.querySelector('#auth-error').textContent='Sign-in failed. Check your email, password, and bot verification.';return;}try{if(await authenticate())await load();else mfa();}catch(error){await supabase.auth.signOut();await login();content.querySelector('#auth-error').textContent=error.message;}});};
 }
 async function load(){
   await verifyAdmin();const requestEpoch=epoch;
   const [songs,data]=await Promise.all([catalog(),inbox()]);
   if(requestEpoch!==epoch||!authenticated)return;
   state={songs,...data};onCatalog();render();
 }
 const date=value=>new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
 function render(){
   if(!state||!authenticated)return;
   const counts={songs:state.songs.length,requests:state.requests.filter(r=>r.status==='pending').length,messages:state.messages.filter(r=>r.status==='new').length};
   show(`<div class="studio-head"><div><div class="eyebrow">DJ-BUANG · STUDIO</div><h2>Your music. Your space.</h2></div><button class="outline" id="signout">Sign out</button></div>${import.meta.env.DEV?'<p class="studio-note">Development preview · Saving is disabled. Inbox reads use your existing administrator access.</p>':''}<div class="studio-nav" role="group" aria-label="Studio sections">${['songs','conversations','requests','messages','analytics'].map(t=>`<button class="${tab===t?'active':''}" data-tab="${t}">${t[0].toUpperCase()+t.slice(1)}${counts[t]!==undefined?` <span>${counts[t]}</span>`:''}</button>`).join('')}</div><div id="studio-panel"></div><div class="studio-bottom"><button class="text-button" id="studio-refresh">Refresh ↻</button><a href="/studio/classic">Classic admin tools ↗</a><p>PayPal support is configured. Receipt identity still needs verification before release.</p></div>`);
   dialog.classList.add('studio-dialog');
   content.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;render();});
   content.querySelector('#signout').onclick=event=>run(event.currentTarget,async()=>{await apiFetch('/api/session',{method:'DELETE'});const {error}=await supabase.auth.signOut();if(error)throw error;clear();toast('Signed out.');});
   content.querySelector('#studio-refresh').onclick=event=>run(event.currentTarget,load);
   if(tab==='songs')renderSongs();else if(tab==='conversations')renderStudioConversations(content.querySelector('#studio-panel'),{toast,songs:state.songs});else if(tab==='analytics')renderAnalytics();else renderInbox();
 }
 function renderSongs(){
   const panel=content.querySelector('#studio-panel');
   panel.innerHTML=`<div class="studio-tools"><label class="search"><input type="search" id="studio-search" aria-label="Search studio songs" placeholder="Find a song…"></label><button class="primary" id="new-song">Add a song +</button></div><p class="studio-help">Downloads are allowed unless switched off. Private songs and drafts stay protected by administrator sign-in.</p><div id="studio-songs"></div>`;
   const draw=()=>{const term=panel.querySelector('input').value.toLowerCase();panel.querySelector('#studio-songs').innerHTML=state.songs.filter(s=>`${s.title} ${s.artist}`.toLowerCase().includes(term)).map(s=>`<div class="studio-song"><img src="${esc(s.coverUrl||'/logo-v2.png')}" alt=""><div><strong>${esc(s.title)}</strong><span>${esc(s.visibility||'private')} · ${esc(s.status||'published')}${s.featured?' · featured':''}</span></div><label class="download-toggle"><input type="checkbox" data-download="${esc(s.id)}" ${s.downloadable!==false?'checked':''}>Downloads</label><div class="studio-song-actions"><button class="outline" data-edit="${esc(s.id)}">Edit</button><button class="text-button danger-button" data-delete="${esc(s.id)}" aria-label="Delete ${esc(s.title)}">Delete</button></div></div>`).join('')||'<p>No songs found.</p>';};draw();
   panel.querySelector('input').oninput=draw;panel.querySelector('#new-song').onclick=()=>editSong();
   panel.onclick=e=>{const button=e.target.closest('[data-edit]');if(button)editSong(state.songs.find(s=>s.id===button.dataset.edit));const remove=e.target.closest('[data-delete]');if(remove)confirmDeleteSong(state.songs.find(s=>s.id===remove.dataset.delete));};
   panel.onchange=e=>{if(!e.target.dataset.download)return;const checkbox=e.target,song=state.songs.find(s=>s.id===checkbox.dataset.download);run(checkbox,async()=>{try{await saveSong({id:song.id,downloadable:checkbox.checked});song.downloadable=checkbox.checked;onCatalog();toast('Download setting saved.');}catch(error){checkbox.checked=song.downloadable!==false;throw error;}});};
 }
 function confirmDeleteSong(song){
   if(!song)return;
   const panel=content.querySelector('#studio-panel');
   panel.innerHTML=`<button class="text-button" id="cancel-delete">← Keep song</button><h3>Delete “${esc(song.title)}”?</h3><p>This removes the song from your library and stops its player and sharing links from working. Its audio, artwork and catalog backup are retained for recovery.</p><p>Its past analytics stay stored, but will no longer appear in your Studio totals.</p><label class="field">Type DELETE to confirm<input id="delete-confirm" autocomplete="off" spellcheck="false"></label><p role="alert" id="delete-error"></p><button class="outline danger-button" id="confirm-delete" disabled>Delete song</button>`;
   panel.querySelector('#cancel-delete').onclick=renderSongs;
   const button=panel.querySelector('#confirm-delete');
   panel.querySelector('#delete-confirm').oninput=event=>{button.disabled=event.target.value!=='DELETE';};
   button.onclick=()=>run(button,async()=>{try{await deleteSong(song.id);toast('Song removed from the library.');await load();}catch(error){panel.querySelector('#delete-error').textContent=error.message;}});
 }
 function editSong(original){
   const song=original||{title:'',artist:'DJ-Buang',lyrics:'',visibility:'private',status:'draft',downloadable:true};
   content.querySelector('#studio-panel').innerHTML=`<button class="text-button" id="back-songs">← Back to songs</button><h3>${original?'Edit song':'Add a song'}</h3><form id="song-editor"><div class="form-columns"><label class="field">Song title<input name="title" value="${esc(song.title)}" required maxlength="300"></label><label class="field">Artist<input name="artist" value="${esc(song.artist)}" required maxlength="300"></label></div><div class="form-columns"><label class="field">Album<select name="albumId"><option value="">Standalone song</option><option value="global-barangay" ${song.albumId==='global-barangay'?'selected':''}>Global Barangay</option></select></label><label class="field">Album track number<input name="albumTrackNumber" type="number" min="1" max="99" step="1" value="${esc(song.albumTrackNumber||'')}"></label></div><label class="field">Featured artists / credits<input name="credits" maxlength="600" value="${esc(song.credits||'')}"></label><p class="studio-help">Global Barangay stays protected by its release switch even if a track is marked public. Use private drafts while finishing the album.</p><label class="field">Requested by (public credit)<input name="requestedBy" value="${esc(song.requestedBy||'')}" maxlength="300" placeholder="Optional requester nickname"></label><p class="studio-help">Leave blank to omit the requester credit. Only add a requester’s nickname with their permission; private conversations and email addresses are never copied here automatically.</p><div class="form-columns"><label class="field">Artwork (JPEG, PNG or WebP · up to 10 MB)<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="field">Audio (up to 100 MB)<input name="audio" type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/flac,audio/ogg,.mp3,.m4a,.wav,.flac,.ogg"></label></div><label class="field">Lyrics<textarea name="lyrics" maxlength="80000">${esc(song.lyrics||'')}</textarea></label><div class="form-columns"><label class="field">Visibility<select name="visibility"><option value="private" ${song.visibility==='private'?'selected':''}>Private · administrator access</option><option value="public" ${song.visibility==='public'?'selected':''}>Public</option></select></label><label class="field">Publishing<select name="status">${['draft','published','hidden'].map(s=>`<option ${song.status===s?'selected':''}>${s}</option>`).join('')}</select></label></div><label class="field"><input type="checkbox" name="downloadable" ${song.downloadable!==false?'checked':''}>Allow song downloads</label><label class="field"><input type="checkbox" name="featured" ${song.featured?'checked':''}>Feature this song</label><p class="studio-help">Listening-only removes the download option. Streamed audio can still be captured. New songs start as private drafts.</p><p role="alert" id="song-error"></p><button class="primary">Save song →</button></form>`;
   content.querySelector('#back-songs').onclick=renderSongs;
   content.querySelector('#song-editor').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;run(form.querySelector('button[type=submit]')||form.querySelector('button'),async()=>{try{const f=form.elements;const next={id:song.id||`song-${crypto.randomUUID()}`,title:f.title.value.trim(),artist:f.artist.value.trim(),albumId:f.albumId.value,albumTrackNumber:f.albumId.value&&f.albumTrackNumber.value?Number(f.albumTrackNumber.value):null,credits:f.credits.value.trim(),requestedBy:f.requestedBy.value.trim(),lyrics:f.lyrics.value,visibility:f.visibility.value,status:f.status.value,featured:f.featured.checked,downloadable:f.downloadable.checked,createdAt:song.createdAt||new Date().toISOString(),coverUrl:song.coverUrl||'',audioUrl:song.audioUrl||''};if(!next.coverUrl&&next.albumId==='global-barangay')next.coverUrl=new URL('/global-barangay-cover.png',location.origin).href;if(f.cover.files[0])next.coverUrl=await uploadFile(f.cover.files[0]);if(f.audio.files[0])next.audioUrl=await uploadFile(f.audio.files[0]);if(next.status==='published'&&!next.audioUrl)throw new Error('Add an audio file before publishing.');await saveSong(next);toast('Song saved.');await load();}catch(error){content.querySelector('#song-error').textContent=error.message;}});};
 }
 function renderInbox(){
   const request=tab==='requests',rows=request?state.requests:state.messages;
   const panel=content.querySelector('#studio-panel');
   panel.innerHTML=`<div class="studio-tools"><h3>${request?'Song requests':'Private messages'}</h3><label class="field compact">Show<select id="inbox-filter"><option value="all">All</option><option value="open">${request?'Pending':'Unread'}</option><option value="done">${request?'Done':'Read'}</option></select></label></div><div id="inbox-list"></div>`;
   const draw=()=>{const filter=panel.querySelector('select').value;const filtered=rows.filter(r=>filter==='all'||(filter==='open'?r.status===(request?'pending':'new'):r.status===(request?'done':'read')));panel.querySelector('#inbox-list').innerHTML=filtered.map(r=>`<article class="inbox-card"><div class="inbox-heading"><h3>${esc(request?r.song_name:r.sender_name)}</h3><span class="status-tag">${esc(r.status)}</span></div><p class="inbox-meta">${esc(request?r.requester_name:r.sender_name)} · ${esc(date(r.created_at))}${request?` · ${esc(r.delivery||'public')} delivery`:''}</p><p class="inbox-body">${esc(request?r.details:r.message)}</p><p class="inbox-meta">Reply contact: ${esc(request?r.email:r.sender_email)||'Not provided'}</p>${request?`<label class="field">Link finished song<select data-link="${r.id}"><option value="">No song linked</option>${state.songs.map(s=>`<option value="${esc(s.id)}" ${r.linked_song_id===s.id?'selected':''}>${esc(s.title)}${s.visibility==='private'?' (private)':''}</option>`).join('')}</select></label>`:''}<button class="outline" data-status="${r.id}">${r.status===(request?'pending':'new')?(request?'Mark done':'Mark read'):(request?'Mark pending':'Mark unread')}</button></article>`).join('')||'<p class="empty-state">Nothing here yet. You’re all caught up.</p>';};draw();
   panel.querySelector('#inbox-filter').onchange=draw;
   panel.onclick=e=>{const b=e.target.closest('[data-status]');if(!b)return;const row=rows.find(r=>String(r.id)===b.dataset.status);run(b,async()=>{const status=row.status===(request?'pending':'new')?(request?'done':'read'):(request?'pending':'new');await updateInbox(request?'song_requests':'private_messages',row.id,{status});row.status=status;render();toast('Status updated.');});};
   panel.onchange=e=>{if(!e.target.dataset.link)return;const select=e.target,row=rows.find(r=>String(r.id)===select.dataset.link);run(select,async()=>{try{const linked_song_id=select.value,status=linked_song_id?'done':'pending';await updateInbox('song_requests',row.id,{linked_song_id,status});Object.assign(row,{linked_song_id,status});render();toast('Request updated. Linking does not change a song’s visibility.');}catch(error){select.value=row.linked_song_id||'';throw error;}});};
 }
 function renderAnalytics(){
   const rows=state.analytics.filter(row=>state.songs.some(song=>song.id===row.song_id));
   const panel=content.querySelector('#studio-panel'),total=field=>rows.reduce((sum,row)=>sum+Number(row[field]||0),0);
   panel.innerHTML=`<div class="metric-grid">${[['plays','Plays'],['unique_listeners','Listeners across songs'],['song_downloads','Song downloads'],['lyrics_downloads','Lyrics downloads']].map(([key,label])=>`<div><strong>${total(key).toLocaleString()}</strong><span>${label}</span></div>`).join('')}</div><p class="studio-help">Only songs currently in your library are included. Listener totals are summed per song, so one person can count more than once.</p><div class="analytics-list">${[...rows].sort((a,b)=>(b.plays||0)-(a.plays||0)).map(r=>{const song=state.songs.find(s=>s.id===r.song_id);return `<div class="studio-row"><div>${esc(song?.title||r.song_id)}<span>${Number(r.song_downloads||0)} downloads · ${Number(r.unique_listeners||0)} listeners</span></div><strong>${Number(r.plays||0)} plays</strong></div>`;}).join('')||'<p>No listening data yet.</p>'}</div>`;
 }
 dialog.addEventListener('close',()=>{if(dialog.open)return;dialog.classList.remove('studio-dialog');delete dialog.dataset.studio;factor=null;content.replaceChildren();content.onchange=null;});
 return {async open(){dialog.classList.remove('studio-dialog');try{if(await authenticate())await load();else mfa();}catch{login();}},clear};
}
