import { installHelp } from './help';
import {openMerchInterest} from './merch-interest';
import { openContact, openMyConversations } from './contact';
import { openSupport } from './support';
import './studio.css';
import { showDetails } from './details';
import { connect } from './boot';
import { interaction } from './data';
import { bindLikes, setLikeCounts, syncLikes } from './likes';
import { ListeningQueue, rankTracks, ALBUM_ID } from './listening-model';
import { createAlbumPage } from './album-page';
import { apiFetch } from '../adminAuth';


const $ = s => document.querySelector(s);
let songs = [];
let filter='all', limit=8, current=-1;
const queue=new ListeningQueue();
let statistics=[], albumPage;
let releaseState={globalBarangayReleased:false};
try{const response=await fetch('/api/release-config',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok){const data=await response.json();releaseState.globalBarangayReleased=data.globalBarangayReleased===true;releaseState.localAlbumPreview=import.meta.env.DEV&&data.localAlbumPreview===true;}}catch{/* Unreleased unless explicitly confirmed by the server. */}
const baseReleaseState={...releaseState};
async function loadAdminAlbumPreview(){
  if(location.hostname!=='codex-dj-buang-2.dj-buang-song-site.pages.dev')return [];
  releaseState={...baseReleaseState};
  try{
    // Refresh the existing HttpOnly media cookie before loading private artwork/audio.
    const session=await apiFetch('/api/session');if(!session.ok||!(await session.json()).authenticated)return [];
    const response=await apiFetch('/api/album-preview');if(!response.ok)return [];
    const data=await response.json();if(data.adminAlbumPreview!==true)return [];
    releaseState.globalBarangayReleased=true;releaseState.localAlbumPreview=true;
    return data.tracks;
  }catch{return [];}
}
let albumSettings={status:'available'};
async function refreshAlbumSettings(){try{const response=await fetch('/api/albums',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok)albumSettings=(await response.json()).album||albumSettings;}catch{/* The server still enforces availability if optional album details cannot load. */}}
await refreshAlbumSettings();
const settings = new Map(songs.map(s=>[s.id,s.downloadable!==false]));
const audio=$('#audio'); audio.volume=.8;
let repeatMode='off';
function updateRepeatControl(){const button=$('#repeat');if(!button)return;const label=repeatMode==='one'?'Repeat song':repeatMode==='all'?'Repeat queue':'Repeat off';button.querySelector('.repeat-symbol').textContent=repeatMode==='one'?'↻¹':'↻';button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(repeatMode!=='off'));audio.loop=repeatMode==='one';}
function updateMediaSession(){
 if(!('mediaSession'in navigator)||current<0||!songs[current])return;
 const song=songs[current];
 const credits=String(song.credits||'').trim();
 const featured=credits.match(/^(?:feat(?:uring)?\.?\s+)(.+)$/i)?.[1]?.trim();
 const artist=[String(song.artist||'DJ-Buang'),featured?`feat. ${featured}`:''].filter(Boolean).join(' ');
 const details={title:String(song.title||'DJ-Buang'),artist,album:String(song.albumTitle||(song.id==='buang-after-dark'?'Buang After Dark · Single':song.albumId==='global-barangay'?'Global Barangay':'DJ-Buang · Single'))};
 try{
  const fallback=new window.MediaMetadata(details);
  try{navigator.mediaSession.metadata=new window.MediaMetadata({...details,artwork:song.coverUrl?[{src:new URL(song.coverUrl,location.href).href,sizes:'512x512'}]:[]});}
  catch{navigator.mediaSession.metadata=fallback;}
 }catch{/* Media metadata is an optional enhancement. */}
 try{navigator.mediaSession.playbackState=audio.paused?'paused':'playing';}catch{/* Some browsers expose a read-only media session. */}
 try{if(Number.isFinite(audio.duration)&&audio.duration>0)navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:audio.playbackRate,position:Math.min(audio.currentTime,audio.duration)});}catch{/* Position controls are not available in every browser. */}
}
function setMediaAction(name,handler){try{if('mediaSession'in navigator)navigator.mediaSession.setActionHandler(name,handler);}catch{/* Ignore unsupported media-session actions. */}}
let restoredListening=false,lastSavedAt=0;
const listeningKey='dj-buang:last-listened:v1';
function saveListening(){if(current<0||!songs[current])return;try{localStorage.setItem(listeningKey,JSON.stringify({id:songs[current].id,position:audio.ended?0:audio.currentTime,volume:audio.volume}));}catch{/* Listening works when browser storage is unavailable. */}}
function restoreListening(){if(restoredListening)return;restoredListening=true;if(new URLSearchParams(location.search).has('song'))return;try{const saved=JSON.parse(localStorage.getItem(listeningKey)||'null');const index=songs.findIndex(song=>song.id===saved?.id);if(index<0)return;current=index;const song=songs[index];queue.start(songs.map(song=>song.id),song.id);audio.src=media(song.audioUrl);audio.volume=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.8;$('#volume').value=audio.volume;const seek=()=>{if(Number.isFinite(saved.position)&&saved.position>0&&Number.isFinite(audio.duration))audio.currentTime=Math.min(saved.position,Math.max(0,audio.duration-1));};audio.addEventListener('loadedmetadata',seek,{once:true});audio.load();$('#player-title').textContent=song.title;$('#player-artist').textContent='Continue listening · '+(song.artist||'DJ-Buang');$('#player-cover').src=song.coverUrl;$('#player-cover').hidden=false;updateDownload();updateMediaSession();render();}catch{/* Ignore invalid or unavailable local history. */}}
window.addEventListener('pagehide',saveListening);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveListening();});audio.addEventListener('pause',saveListening);audio.addEventListener('seeked',saveListening);audio.addEventListener('timeupdate',()=>{if(Date.now()-lastSavedAt>5000){lastSavedAt=Date.now();saveListening();}});
const media=(url)=>url;
const downloadUrl=song=>song.audioUrl?.startsWith('/media/')?song.audioUrl:'/api/download?id='+encodeURIComponent(song.id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('#notice').textContent=message;$('#notice').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#notice').style.display='none',4500);}
function render(){
 const term=$('#search').value.trim().toLowerCase();
 const list=songs.filter(s=>(filter!=='featured'||s.featured)&&(filter!=='downloads'||settings.get(s.id))&&`${s.title} ${s.artist}`.toLowerCase().includes(term));
 $('#song-count').textContent=`${list.length} ${list.length === 1 ? 'song' : 'songs'}`;
 $('#empty').hidden=!!list.length; $('#more').hidden=list.length<=limit;
 $('#songs').innerHTML=list.slice(0,limit).map(s=>`<article class="song"><div class="song-art"><img src="${esc(s.coverUrl)}" alt="${esc(s.title)} artwork" loading="lazy"><span class="song-badge">PRESS PLAY</span><button class="song-play" data-play="${esc(s.id)}" aria-label="Play ${esc(s.title)}">${current>=0&&songs[current].id===s.id&&!audio.paused?'Ⅱ':'▶'}</button></div><h3 class="song-title" title="${esc(s.title)}">${esc(s.title)}</h3><div class="song-meta"><span>${esc(s.artist||'DJ-Buang')}</span></div><p class="song-requester">${s.requestedBy?.trim() && !/^dj[\s-]*buang$/i.test(s.requestedBy.trim()) ? `Requested by ${esc(s.requestedBy.trim())}` : '&nbsp;'}</p><div class="song-actions"><button class="song-like" data-like="${esc(s.id)}" aria-label="Like ${esc(s.title)}" aria-pressed="false">♡ Like</button><button class="queue-add" data-enqueue="${esc(s.id)}" aria-label="Play ${esc(s.title)} next" title="Play next">＋</button><button class="song-details" data-details="${esc(s.id)}">Lyrics & more ↗</button></div></article>`).join('');
 syncLikes();
 renderDiscovery();albumPage?.render();renderQueueIfOpen();
}
async function play(index,{fromQueue=false,force=false}={}){
 if(index<0||index>=songs.length)return;
 if(current===index&&!force){if(audio.paused){audio.autoplay=true;await audio.play().catch(()=>toast('Playback could not start. Please try again.'));}else audio.pause();return;}
 saveListening();const selected=songs[index];if(!fromQueue)queue.start(songs.map(song=>song.id),selected.id);
 current=index;const song=songs[index];audio.autoplay=true;audio.src=media(song.audioUrl);
 // Start immediately after changing the source. On an ended event this keeps the
 // play request in the same task, which gives mobile browsers the best chance to
 // continue the album while the page is backgrounded.
 const start=audio.play();
 $('#player-title').textContent=song.title;$('#player-artist').textContent=song.artist||'DJ-Buang';$('#player-cover').src=song.coverUrl;$('#player-cover').hidden=false;updateDownload();updateMediaSession();progressMilestones.clear();track(song.id,'open');track(song.id,'play_start');
 try{await start;}catch(error){if(error?.name!=='AbortError'){const message=error?.name==='NotAllowedError'?'Your browser paused playback between tracks. Unlock your phone and tap Play to continue.':'The next track could not start. Unlock your phone and tap Play to retry.';$('#player-artist').textContent=message;toast(message);try{if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';}catch{/* Optional browser feature. */}}}render();
}
function updateDownload(){
 const button=$('#player-like');button.hidden=current<0||!songs[current];
 if(current>=0&&songs[current]){button.dataset.like=songs[current].id;button.setAttribute('aria-label','Like '+songs[current].title);}
 else delete button.dataset.like;
 syncLikes();
}
function modal(html){delete $('#modal').dataset.queueView;$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
$('#modal .close').onclick=()=>$('#modal').close();
function detail(song){showDetails(song,{modal,esc,toast,downloadUrl,play:()=>play(songs.findIndex(s=>s.id===song.id))});}
$('#songs').onclick=event=>{const p=event.target.closest('[data-play]');if(p)play(songs.findIndex(s=>s.id===p.dataset.play));const d=event.target.closest('[data-details]');if(d)detail(songs.find(s=>s.id===d.dataset.details));};
$('#search').oninput=()=>{limit=8;render();};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;limit=8;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render();});
$('#more').onclick=()=>{limit+=8;render();};
$('#play').onclick=()=>{if(current<0&&queue.ids.length)playQueued(queue.current()||queue.next());else play(current<0?0:current);};
$('#previous').onclick=()=>{if(audio.currentTime>3){audio.currentTime=0;return;}playQueued(queue.previous());};
$('#next').onclick=()=>advanceQueue();
audio.onplay=()=>{$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','Pause');updateMediaSession();render();};audio.onpause=()=>{$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play');updateMediaSession();render();};audio.onended=()=>{if(current>=0){const id=songs[current].id;recordProgress(id,1);if(!progressMilestones.has('play_finished')){progressMilestones.add('play_finished');track(id,'play_finished');}}advanceQueue(true);};
audio.addEventListener('loadedmetadata',updateMediaSession);audio.addEventListener('timeupdate',()=>{if(!audio.paused)updateMediaSession();});
setMediaAction('play',()=>audio.play().catch(()=>{}));setMediaAction('pause',()=>audio.pause());setMediaAction('nexttrack',()=>advanceQueue());setMediaAction('previoustrack',()=>{if(audio.currentTime>3)audio.currentTime=0;else playQueued(queue.previous());});setMediaAction('seekto',event=>{if(Number.isFinite(event.seekTime))audio.currentTime=event.seekTime;});
const time=n=>Number.isFinite(n)?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'0:00';
audio.ontimeupdate=()=>{$('#elapsed').textContent=time(audio.currentTime);$('#duration').textContent=time(audio.duration);$('#seek').value=audio.duration?audio.currentTime/audio.duration*100:0;};
$('#seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*e.target.value/100;};$('#volume').oninput=e=>audio.volume=Number(e.target.value);
function contact(kind){openContact(kind,modal).catch(error=>toast(error.message));}
$('#request-open').onclick=()=>contact('request');
$('#requests').insertAdjacentHTML('beforeend','<div class="secondary-actions"><button class="text-button" id="message-open">Send a message ↗</button><button class="text-button" id="inbox-open">My conversations ↗</button><button class="text-button" id="support-open">Support the music ♡</button></div>');
$('#message-open').onclick=()=>contact('message');
$('#support-open').onclick=()=>openSupport(modal);
$('#requests').insertAdjacentHTML('afterend','<section class="merch" id="merch"><div><div class="eyebrow">ON THE HORIZON · MERCH CONCEPTS</div><h2>Wear the sound<span>.</span></h2><p>Turn the Buang On! A first look at the DJ-Buang and PHIL-ICE ideas: caps, hoodies, tees, and jerseys.</p><p>These are design sketches. No products are on sale yet.</p><div class="merch-actions"><button class="outline" id="merch-open">Original merch concepts ↗</button><button class="outline" id="album-merch-open">Global Barangay capsule ↗</button><button class="outline" id="merch-interest-open">Interested in merch? ↗</button></div></div><img src="/merch-concept.png" loading="lazy" alt="DJ-Buang and PHIL-ICE logo and merchandise concept board: caps, hoodies, T-shirts and jerseys in black, white, red and blue"></section>');
$('#merch-interest-open').onclick=()=>openMerchInterest({modal,esc,collection:'global-barangay'});
$('#merch-open').onclick=()=>{modal('<div class="eyebrow">FUTURE COLLECTION</div><h2>DJ-Buang × PHIL-ICE</h2><img src="/merch-concept.png" style="width:100%;border-radius:4px" alt="Merchandise concept board"><p>Two worlds. One sound. These early concepts will shape a future collection. Sizes, prices, and launch details are still to come.</p><button class="primary" id="original-interest">Interested in this? →</button>');document.querySelector('#original-interest').onclick=()=>openMerchInterest({modal,esc,collection:'original'});};
$('#album-merch-open').onclick=()=>{modal(`<div class="eyebrow">GLOBAL BARANGAY · LIMITED CAPSULE CONCEPT</div><h2>Wear the album.</h2><p>A possible limited Global Barangay line, built around the original DJ-Buang identity and the album’s artwork. Turn the Buang On!</p><p class="studio-note">Design concepts only. No products are on sale, and quantities, prices, sizes, production methods, and release plans have not been decided.</p><button class="primary" id="capsule-interest">Interested in this? →</button><h3>Night Edition</h3><p>Black hoodies, tees, caps, and a jersey. Small front logos meet larger album artwork on selected backs, with gold, red, and ice-blue details.</p><img class="album-merch-board" src="/global-barangay-merch-night.png" alt="Global Barangay Night Edition concept board showing black hoodies, T-shirts, cap and basketball jersey with original DJ-Buang branding and album graphics"><h3>Island / Ice Edition</h3><p>White and blue pieces with a lighter feel: album prints, a cap, a tote, and a jersey. PHIL-ICE — Two Worlds. One Sound.</p><img class="album-merch-board" src="/global-barangay-merch-island-ice.png" alt="Global Barangay Island and Ice Edition concept board showing white and blue garments and accessories with album artwork and DJ-Buang branding"><p>The original DJ-Buang / PHIL-ICE concepts remain a separate collection. These mockups explore the album line; they are not manufacturing artwork.</p>`);document.querySelector('#capsule-interest').onclick=()=>openMerchInterest({modal,esc,collection:'global-barangay'});};

installHelp();

albumPage=createAlbumPage({getSongs:()=>songs,getRelease:()=>releaseState.globalBarangayReleased,getPreview:()=>releaseState.localAlbumPreview,getAlbum:()=>albumSettings,playAlbum,detail,esc});
connect({detail,$,getSongs:()=>songs,setSongs:value=>songs=value,getCurrent:()=>current,setCurrent:value=>current=value,settings,audio,render,updateDownload,modal,esc,toast,onCatalogReady:()=>{refreshAlbumSettings().then(()=>albumPage.render());restoreListening();queue.reconcile(songs.map(song=>song.id));albumPage.render();renderQueueIfOpen();loadMusicStats();},getPreviewSongs:loadAdminAlbumPreview,isVisibleSong:song=>song.albumId!==ALBUM_ID||releaseState.globalBarangayReleased});
const progressMilestones=new Set();
function track(id,type){interaction(id,type).catch(()=>{});}
function recordProgress(songId,progress){for(const [threshold,event] of [[.25,'play_25'],[.5,'play_50'],[.75,'play_75']])if(progress>=threshold&&!progressMilestones.has(event)){progressMilestones.add(event);track(songId,event);}}
audio.addEventListener('timeupdate',()=>{if(!audio.paused&&current>=0&&audio.duration>0)recordProgress(songs[current].id,audio.currentTime/audio.duration);});

document.querySelector('#inbox-open').onclick=()=>openMyConversations(modal).catch(error=>toast(error.message));
if(new URLSearchParams(location.search).get('inbox')==='1')openMyConversations(modal).catch(error=>toast(error.message));

bindLikes(toast,loadMusicStats);
async function loadMusicStats(){
 try{
  const response=await fetch('/api/music-stats');if(!response.ok)return;
  const data=await response.json();
  if(!['songs','plays','likes'].every(key=>Number.isSafeInteger(data[key])&&data[key]>=0)||!Array.isArray(data.tracks))return;
  setLikeCounts(data.tracks);statistics=data.tracks;renderDiscovery();
  for(const key of ['songs','plays','likes'])document.querySelector('[data-public-stat="'+key+'"]').textContent=data[key].toLocaleString();
  $('#music-stats').hidden=false;
  if(data.snapshot)$('#music-stats .stats-note').textContent='Preview snapshot · '+data.snapshot+' · Current public collection only.';
 }catch{/* Counts are optional: listening remains available during an outage. */}
}

function playQueued(id){
 if(!id)return;
 const index=songs.findIndex(song=>song.id===id);
 if(index>=0)play(index,{fromQueue:true,force:true});
}
function advanceQueue(ended=false){
 if(!queue.ids.length&&songs.length)queue.start(songs.map(song=>song.id),current>=0?songs[current].id:null);
 let id=queue.next();if(!id&&repeatMode==='all'&&queue.ids.length){queue.position=-1;id=queue.next();}
 if(id)playQueued(id);else{audio.pause();toast(ended?'That’s the queue. Find your next replay below.':'You’re at the end of the queue. Add another song to keep listening.');}
}
function playAlbum(tracks,selected=tracks[0]?.id){
 if(!tracks.length)return;
 queue.start(tracks.map(song=>song.id),selected);playQueued(selected);
}
function addToQueue(id){
 if(!songs.some(song=>song.id===id))return;
 if(!queue.ids.length&&current>=0)queue.start(songs.map(song=>song.id),songs[current].id);
 toast(queue.enqueue(id)?'Added to play next.':'That song is already playing or queued next.');renderQueueIfOpen();
}
function openQueue(){
 const selected=queue.current();
 modal(`<div class="eyebrow">YOUR LISTENING SESSION</div><h2>Up next<span>.</span></h2><p class="studio-help">${queue.shuffled?'Shuffle is on.':'Playing in order.'} Add songs with the ＋ button. This queue stays in this browser session.</p>${queue.ids.length?`<ol class="queue-list">${queue.ids.map((id,index)=>{const song=songs.find(song=>song.id===id);if(!song)return '';return `<li class="${index===queue.position?'queue-current':''}"><button class="queue-track" data-queue-position="${index}"><span>${index===queue.position?'▶':String(index+1).padStart(2,'0')}</span><div><strong>${esc(song.title)}</strong><small>${index===queue.position?'Now playing':index<queue.position?'Played':esc(song.artist||'DJ-Buang')}</small></div></button>${index>queue.position?`<button class="queue-remove" data-queue-remove="${index}" aria-label="Remove ${esc(song.title)} from queue">×</button>`:''}</li>`;}).join('')}</ol>`:'<p>Your queue is waiting. Start a song, play an album, or add a song with ＋.</p><button class="primary" id="queue-play-collection">Play the collection ▶</button>'}`);
 $('#modal').dataset.queueView='true';
 $('#queue-play-collection')?.addEventListener('click',()=>{if(songs.length){queue.start(songs.map(song=>song.id));playQueued(queue.current());}});
 $('#modal-content').querySelectorAll('[data-queue-position]').forEach(button=>button.onclick=()=>playQueued(queue.choose(Number(button.dataset.queuePosition))));
 $('#modal-content').querySelectorAll('[data-queue-remove]').forEach(button=>button.onclick=()=>{queue.remove(Number(button.dataset.queueRemove));openQueue();});
 if(selected)syncLikes();
}
function renderQueueIfOpen(){
 $('#shuffle').setAttribute('aria-pressed',String(queue.shuffled));
 $('#queue-open').textContent='Up next'+(queue.ids.length?' · '+Math.max(0,queue.ids.length-queue.position-1):'');
 if($('#modal').open&&$('#modal').dataset.queueView==='true')openQueue();
}
$('#queue-open').onclick=openQueue;
$('#shuffle').onclick=()=>{if(!queue.ids.length&&songs.length)queue.start(songs.map(song=>song.id),current>=0?songs[current].id:null);const enabled=queue.shuffle();toast(enabled?'Shuffle on. Your current song stays in place.':'Shuffle off. Back to the collection’s order.');renderQueueIfOpen();};
$('#repeat').onclick=()=>{repeatMode=repeatMode==='off'?'all':repeatMode==='all'?'one':'off';updateRepeatControl();toast(repeatMode==='one'?'Repeating this song.':repeatMode==='all'?'Repeating the queue.':'Repeat off.');};updateRepeatControl();
document.addEventListener('click',event=>{const button=event.target.closest('[data-enqueue]');if(button)addToQueue(button.dataset.enqueue);});
function renderDiscovery(){
 const section=$('#discovery');if(!section)return;
 const panels=[['plays','Most played','The tracks getting repeat visits.'],['likes','Most loved','A little love from the barangay.']].map(([metric,title,description])=>{
   const rows=rankTracks(songs,statistics,metric);
   return rows.length?`<section class="discovery-panel"><div class="eyebrow">${metric==='plays'?'ON REPEAT':'COMMUNITY LOVE'}</div><h2>${title}<span>.</span></h2><p>${description}</p><div>${rows.map(({song,count},index)=>`<article class="discovery-track"><span class="discovery-rank">${String(index+1).padStart(2,'0')}</span><button class="discovery-play" data-discovery-play="${esc(song.id)}" aria-label="Play ${esc(song.title)}"><img src="${esc(song.coverUrl||'/logo-v2.png')}" alt="" loading="lazy"><span>▶</span></button><div><h3>${esc(song.title)}</h3><small>${count.toLocaleString()} ${metric==='plays'?'plays':'likes'}</small></div><button class="queue-add" data-enqueue="${esc(song.id)}" aria-label="Play ${esc(song.title)} next">＋</button></article>`).join('')}</div></section>`:'';
 }).join('');section.innerHTML=panels;section.hidden=!panels;
 section.querySelectorAll('[data-discovery-play]').forEach(button=>button.onclick=()=>play(songs.findIndex(song=>song.id===button.dataset.discoveryPlay)));
}

$('#surprise-me').onclick=()=>{if(!songs.length){toast('The collection is still loading. Please try again.');return;}const choices=songs.map((song,index)=>index).filter(index=>songs.length===1||index!==current);play(choices[Math.floor(Math.random()*choices.length)]);};
