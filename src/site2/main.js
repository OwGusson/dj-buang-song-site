import { openContact, openMyConversations } from './contact';
import { openSupport } from './support';
import './studio.css';
import { showDetails } from './details';
import { connect } from './boot';
import { interaction } from './data';
import { bindLikes, setLikeCounts, syncLikes } from './likes';
import { ListeningQueue, rankTracks, ALBUM_ID } from './listening-model';
import { createAlbumPage } from './album-page';


const $ = s => document.querySelector(s);
let songs = [];
let filter='all', limit=8, current=-1;
const queue=new ListeningQueue();
let statistics=[], albumPage;
let releaseState={globalBarangayReleased:false};
try{const response=await fetch('/api/release-config',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(response.ok){const data=await response.json();releaseState.globalBarangayReleased=data.globalBarangayReleased===true;}}catch{/* Unreleased unless explicitly confirmed by the server. */}
const settings = new Map(songs.map(s=>[s.id,s.downloadable!==false]));
const audio=$('#audio'); audio.volume=.8;
const media=(url)=>url;
const downloadUrl=song=>'/api/download?id='+encodeURIComponent(song.id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('#notice').textContent=message;$('#notice').style.display='block';clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#notice').style.display='none',4500);}
function render(){
 const term=$('#search').value.trim().toLowerCase();
 const list=songs.filter(s=>(filter!=='featured'||s.featured)&&(filter!=='downloads'||settings.get(s.id))&&`${s.title} ${s.artist}`.toLowerCase().includes(term));
 $('#song-count').textContent=`${list.length} ${list.length === 1 ? 'song' : 'songs'}`;
 $('#empty').hidden=!!list.length; $('#more').hidden=list.length<=limit;
 $('#songs').innerHTML=list.slice(0,limit).map(s=>`<article class="song"><div class="song-art"><img src="${esc(s.coverUrl)}" alt="${esc(s.title)} artwork" loading="lazy"><span class="song-badge">PRESS PLAY</span><button class="song-play" data-play="${esc(s.id)}" aria-label="Play ${esc(s.title)}">${current>=0&&songs[current].id===s.id&&!audio.paused?'Ⅱ':'▶'}</button></div><h3 class="song-title" title="${esc(s.title)}">${esc(s.title)}</h3><div class="song-meta"><span>${esc(s.artist||'DJ-Buang')}</span></div><p class="song-requester">Requested by ${esc(s.requestedBy?.trim()||'DJ-Buang')}</p><div class="song-actions"><button class="song-like" data-like="${esc(s.id)}" aria-label="Like ${esc(s.title)}" aria-pressed="false">♡ Like</button><button class="queue-add" data-enqueue="${esc(s.id)}" aria-label="Play ${esc(s.title)} next" title="Play next">＋</button><button class="song-details" data-details="${esc(s.id)}">Lyrics & more ↗</button></div></article>`).join('');
 syncLikes();
 renderDiscovery();albumPage?.render();renderQueueIfOpen();
}
async function play(index,{fromQueue=false,force=false}={}){
 if(index<0||index>=songs.length)return;
 if(current===index&&!force){if(audio.paused) await audio.play().catch(()=>toast('Playback could not start. Please try again.'));else audio.pause();return;}
 const selected=songs[index];if(!fromQueue)queue.start(songs.map(song=>song.id),selected.id);
 current=index;const song=songs[index];audio.src=media(song.audioUrl);$('#player-title').textContent=song.title;$('#player-artist').textContent=song.artist||'DJ-Buang';$('#player-cover').src=song.coverUrl;$('#player-cover').hidden=false;updateDownload();progressTracked=false;track(song.id,'open');track(song.id,'play_start');await audio.play().catch(()=>toast('Playback could not start. Please try again.'));render();
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
audio.onplay=()=>{$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','Pause');render();};audio.onpause=()=>{$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play');render();};audio.onended=()=>advanceQueue(true);
const time=n=>Number.isFinite(n)?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'0:00';
audio.ontimeupdate=()=>{$('#elapsed').textContent=time(audio.currentTime);$('#duration').textContent=time(audio.duration);$('#seek').value=audio.duration?audio.currentTime/audio.duration*100:0;};
$('#seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*e.target.value/100;};$('#volume').oninput=e=>audio.volume=Number(e.target.value);
function contact(kind){openContact(kind,modal).catch(error=>toast(error.message));}
$('#request-open').onclick=()=>contact('request');
$('#requests').insertAdjacentHTML('beforeend','<div class="secondary-actions"><button class="text-button" id="message-open">Send a message ↗</button><button class="text-button" id="inbox-open">My conversations ↗</button><button class="text-button" id="support-open">Support the music ♡</button></div>');
$('#message-open').onclick=()=>contact('message');
$('#support-open').onclick=()=>openSupport(modal);
$('#requests').insertAdjacentHTML('afterend','<section class="merch" id="merch"><div><div class="eyebrow">ON THE HORIZON · MERCH CONCEPTS</div><h2>Wear the sound<span>.</span></h2><p>Turn the Buang On! A first look at the DJ-Buang and PHIL-ICE ideas: caps, hoodies, tees, and jerseys.</p><p>These are design sketches. No products are on sale yet.</p><button class="outline" id="merch-open">Explore the concepts ↗</button></div><img src="/merch-concept.png" loading="lazy" alt="DJ-Buang and PHIL-ICE logo and merchandise concept board: caps, hoodies, T-shirts and jerseys in black, white, red and blue"></section>');
$('#merch-open').onclick=()=>modal('<div class="eyebrow">FUTURE COLLECTION</div><h2>DJ-Buang × PHIL-ICE</h2><img src="/merch-concept.png" style="width:100%;border-radius:4px" alt="Merchandise concept board"><p>Two worlds. One sound. These early concepts will shape a future collection. Sizes, prices, and launch details are still to come.</p>');
albumPage=createAlbumPage({getSongs:()=>songs,getRelease:()=>releaseState.globalBarangayReleased,playAlbum,detail,esc});
connect({detail,$,getSongs:()=>songs,setSongs:value=>songs=value,getCurrent:()=>current,setCurrent:value=>current=value,settings,audio,render,updateDownload,modal,esc,toast,onCatalogReady:()=>{queue.reconcile(songs.map(song=>song.id));albumPage.render();renderQueueIfOpen();loadMusicStats();},isVisibleSong:song=>song.albumId!==ALBUM_ID||releaseState.globalBarangayReleased});
let progressTracked=false;
function track(id,type){interaction(id,type).catch(()=>{});}
audio.addEventListener('timeupdate',()=>{if(!progressTracked&&current>=0&&audio.duration>0&&audio.currentTime/audio.duration>=.25){progressTracked=true;track(songs[current].id,'play_25');}});

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
 const id=queue.next();if(id)playQueued(id);else{audio.pause();toast(ended?'That’s the queue. Find your next replay below.':'You’re at the end of the queue. Add another song to keep listening.');}
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
document.addEventListener('click',event=>{const button=event.target.closest('[data-enqueue]');if(button)addToQueue(button.dataset.enqueue);});
function renderDiscovery(){
 const section=$('#discovery');if(!section)return;
 const panels=[['plays','Most played','The tracks getting repeat visits.'],['likes','Most loved','A little love from the barangay.']].map(([metric,title,description])=>{
   const rows=rankTracks(songs,statistics,metric);
   return rows.length?`<section class="discovery-panel"><div class="eyebrow">${metric==='plays'?'ON REPEAT':'COMMUNITY LOVE'}</div><h2>${title}<span>.</span></h2><p>${description}</p><div>${rows.map(({song,count},index)=>`<article class="discovery-track"><span class="discovery-rank">${String(index+1).padStart(2,'0')}</span><button class="discovery-play" data-discovery-play="${esc(song.id)}" aria-label="Play ${esc(song.title)}"><img src="${esc(song.coverUrl||'/logo-v2.png')}" alt="" loading="lazy"><span>▶</span></button><div><h3>${esc(song.title)}</h3><small>${count.toLocaleString()} ${metric==='plays'?'plays':'likes'}</small></div><button class="queue-add" data-enqueue="${esc(song.id)}" aria-label="Play ${esc(song.title)} next">＋</button></article>`).join('')}</div></section>`:'';
 }).join('');section.innerHTML=panels;section.hidden=!panels;
 section.querySelectorAll('[data-discovery-play]').forEach(button=>button.onclick=()=>play(songs.findIndex(song=>song.id===button.dataset.discoveryPlay)));
}
