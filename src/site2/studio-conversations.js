import {apiFetch} from '../adminAuth';
import {requireWrites} from './data';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(action,data){
 if(action)requireWrites();
 const response=await apiFetch('/api/conversations',{method:action?'POST':'GET',...(action?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data})}:{})});
 const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'The conversation inbox could not load.');return result;
}
export async function renderStudioConversations(panel,{toast,songs}){
 const current=()=>panel.isConnected;
 panel.innerHTML='<h3>Private conversations</h3><p>Loading the verified inbox…</p>';
 try{
   const data=await request();if(!current())return;
   panel.innerHTML=`<div class="studio-tools"><h3>Verified inbox</h3><label class="field compact">Show<select id="thread-filter"><option value="all">All conversations</option><option value="request">Song requests</option><option value="message">Messages</option><option value="open">Active</option></select></label></div><div class="pause-controls"><label class="field"><input id="pause-requests" type="checkbox" ${data.settings.pause_requests?'checked':''}>Pause new requests</label><label class="field"><input id="pause-messages" type="checkbox" ${data.settings.pause_messages?'checked':''}>Pause new messages</label></div><div id="verified-threads"></div>`;
   const list=panel.querySelector('#verified-threads');
   const draw=()=>{const f=panel.querySelector('select').value;list.innerHTML=data.threads.filter(t=>f==='all'||t.kind===f||(f==='open'&&!['closed','done'].includes(t.status))).map(t=>`<button class="conversation-summary" data-open-thread="${esc(t.id)}"><span><strong>${esc(t.title)}</strong><small>${esc(t.nickname)} · ${esc(t.kind)} · ${esc(t.status.replaceAll('_',' '))}${t.blocked?' · blocked':''}</small></span><span>↗</span></button>`).join('')||'<p>No matching conversations.</p>';list.querySelectorAll('[data-open-thread]').forEach(b=>b.onclick=()=>detail(b.dataset.openThread));};draw();
   panel.querySelector('select').onchange=draw;
   panel.querySelectorAll('.pause-controls input').forEach(input=>input.onchange=async()=>{input.disabled=true;try{await request('settings',{pause_requests:panel.querySelector('#pause-requests').checked,pause_messages:panel.querySelector('#pause-messages').checked});toast('Submission settings saved.');}catch(error){input.checked=!input.checked;toast(error.message);}finally{input.disabled=false;}});
   async function detail(id){
     panel.innerHTML='<p>Loading the conversation…</p>';
     try{
       const response=await apiFetch('/api/conversations?id='+encodeURIComponent(id));const result=await response.json();if(!response.ok)throw Error(result.error);if(!current())return;
       const {thread:t,posts}=result;
       panel.innerHTML=`<button class="text-button" id="threads-back">← Verified inbox</button><h3>${esc(t.title)}</h3><p class="inbox-meta">${esc(t.nickname)} · ${esc(t.owner_email)}${t.blocked?' · Blocked':''}</p><div class="consent-summary"><strong>Requester’s permissions</strong><p>Publish finished song: ${t.publish_song?'Yes':'No'} · Credit nickname: ${t.credit_name?'Yes':'No'}</p><p class="studio-help">Conversation notes and email remain private. Linking a song does not publish it.</p></div><div class="conversation-posts">${posts.map(p=>`<article class="conversation-post ${p.author_role==='artist'?'artist-reply':''}"><strong>${p.author_role==='artist'?'DJ-Buang':esc(t.nickname)}</strong><time>${esc(new Date(p.created_at).toLocaleString())}</time><p>${esc(p.body)}</p></article>`).join('')}</div><form id="artist-reply"><label class="field">Reply as DJ-Buang<textarea name="body" maxlength="10000" required></textarea></label><button class="primary">Send private reply →</button><p class="studio-help">An email notification contains a link to the inbox, not the message contents.</p></form><div class="form-columns"><label class="field">Status<select id="thread-status">${['pending','in_progress','waiting','done','closed'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s.replaceAll('_',' ')}</option>`).join('')}</select></label><label class="field">Linked song<select id="thread-song"><option value="">No song linked</option>${songs.map(s=>`<option value="${esc(s.id)}" ${t.linked_song_id===s.id?'selected':''}>${esc(s.title)} (${esc(s.visibility)})</option>`).join('')}</select></label></div><div class="detail-actions"><button class="outline" id="save-thread">Save status and linked song</button><button class="outline" id="block-contact">${t.blocked?'Unblock':'Block'} sender</button></div>`;
       panel.querySelector('#threads-back').onclick=()=>renderStudioConversations(panel,{toast,songs});
       const act=async(button,action,patch)=>{button.disabled=true;try{await request(action,{id,...patch});toast('Saved.');await detail(id);}catch(error){toast(error.message);button.disabled=false;}};
       panel.querySelector('#artist-reply').onsubmit=e=>{e.preventDefault();act(e.currentTarget.querySelector('button'),'reply',{body:e.currentTarget.elements.body.value.trim()});};
       panel.querySelector('#save-thread').onclick=e=>act(e.currentTarget,'update',{status:panel.querySelector('#thread-status').value,linked_song_id:panel.querySelector('#thread-song').value});
       panel.querySelector('#block-contact').onclick=e=>act(e.currentTarget,'block',{blocked:!t.blocked});
     }catch(error){if(current())panel.innerHTML=`<p>${esc(error.message)}</p>`;}
   }
 }catch(error){if(current())panel.innerHTML=`<h3>Private conversations</h3><p>${esc(error.message)}</p><p class="studio-help">Historical requests and messages remain available in their existing tabs.</p>`;}
}
