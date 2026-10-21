import { openContact } from './contact';
import { openSupport } from './support';
import './studio.css';
import { showDetails } from './details';
import { connect } from './boot';
import { interaction } from './data';


const $ = s => document.querySelector(s);
let songs = [];
let filter='all', limit=8, current=-1;
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
 $('#songs').innerHTML=list.slice(0,limit).map(s=>`<article class="song"><div class="song-art"><img src="${esc(s.coverUrl)}" alt="${esc(s.title)} artwork" loading="lazy"><span class="song-badge">${settings.get(s.id)?'LISTEN + DOWNLOAD':'LISTEN ONLINE'}</span><button class="song-play" data-play="${esc(s.id)}" aria-label="Play ${esc(s.title)}">${current>=0&&songs[current].id===s.id&&!audio.paused?'Ⅱ':'▶'}</button></div><h3 class="song-title" title="${esc(s.title)}">${esc(s.title)}</h3><div class="song-meta"><span>${esc(s.artist||'DJ-Buang')}</span><button data-details="${esc(s.id)}">Lyrics & more ↗</button></div></article>`).join('');
}
async function play(index){
 if(index<0||index>=songs.length)return;
 if(current===index){if(audio.paused) await audio.play().catch(()=>toast('Playback could not start. Please try again.'));else audio.pause();return;}
 current=index;const song=songs[index];audio.src=media(song.audioUrl);$('#player-title').textContent=song.title;$('#player-artist').textContent=song.artist||'DJ-Buang';$('#player-cover').src=song.coverUrl;$('#player-cover').hidden=false;updateDownload();progressTracked=false;track(song.id,'open');track(song.id,'play_start');await audio.play().catch(()=>toast('Playback could not start. Please try again.'));render();
}
function updateDownload(){const a=$('#player-download');a.hidden=current<0||!songs[current]||!settings.get(songs[current].id);if(current>=0&&songs[current]){a.href=downloadUrl(songs[current]);a.download=songs[current].title;a.onclick=()=>track(songs[current].id,'download_song');}}
function modal(html){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();}
$('#modal .close').onclick=()=>$('#modal').close();
function detail(song){showDetails(song,{modal,esc,toast,downloadUrl,play:()=>play(songs.findIndex(s=>s.id===song.id))});}
$('#songs').onclick=event=>{const p=event.target.closest('[data-play]');if(p)play(songs.findIndex(s=>s.id===p.dataset.play));const d=event.target.closest('[data-details]');if(d)detail(songs.find(s=>s.id===d.dataset.details));};
$('#search').oninput=()=>{limit=8;render();};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;limit=8;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));render();});
$('#more').onclick=()=>{limit+=8;render();};
$('#play').onclick=()=>play(current<0?0:current);$('#previous').onclick=()=>play((current-1+songs.length)%songs.length);$('#next').onclick=()=>play((current+1)%songs.length);
audio.onplay=()=>{$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','Pause');render();};audio.onpause=()=>{$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play');render();};audio.onended=()=>play((current+1)%songs.length);
const time=n=>Number.isFinite(n)?`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`:'0:00';
audio.ontimeupdate=()=>{$('#elapsed').textContent=time(audio.currentTime);$('#duration').textContent=time(audio.duration);$('#seek').value=audio.duration?audio.currentTime/audio.duration*100:0;};
$('#seek').oninput=e=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*e.target.value/100;};$('#volume').oninput=e=>audio.volume=Number(e.target.value);
$('#album-open').onclick=()=>modal('<div class="eyebrow">A NEW CHAPTER</div><h2>Global Barangay</h2><p>The forthcoming DJ-Buang album will have a home here: its story, artwork, track list, and listening links in one place.</p><p>The release date and Spotify availability have not been announced. </p><button class="primary" id="back-music">Explore current music ↘</button>');
$('#modal-content').addEventListener('click',e=>{if(e.target.id==='back-music'){$('#modal').close();location.hash='music';}});
function contact(kind){openContact(kind,modal);}
$('#request-open').onclick=()=>contact('request');
$('#requests').insertAdjacentHTML('beforeend','<div class="secondary-actions"><button class="text-button" id="message-open">Send a message ↗</button><button class="text-button" id="support-open">Support the music ♡</button></div>');
$('#message-open').onclick=()=>contact('message');
$('#support-open').onclick=()=>openSupport(modal);
$('#requests').insertAdjacentHTML('afterend','<section class="merch" id="merch"><div><div class="eyebrow">ON THE HORIZON · MERCH CONCEPTS</div><h2>Wear the sound<span>.</span></h2><p>Turn the Buang On! A first look at the DJ-Buang and PHIL-ICE ideas: caps, hoodies, tees, and jerseys.</p><p>These are design sketches. No products are on sale yet.</p><button class="outline" id="merch-open">Explore the concepts ↗</button></div><img src="/merch-concept.png" loading="lazy" alt="DJ-Buang and PHIL-ICE logo and merchandise concept board: caps, hoodies, T-shirts and jerseys in black, white, red and blue"></section>');
$('#merch-open').onclick=()=>modal('<div class="eyebrow">FUTURE COLLECTION</div><h2>DJ-Buang × PHIL-ICE</h2><img src="/merch-concept.png" style="width:100%;border-radius:4px" alt="Merchandise concept board"><p>Two worlds. One sound. These early concepts will shape a future collection. Sizes, prices, and launch details are still to come.</p>');
connect({detail,$,getSongs:()=>songs,setSongs:value=>songs=value,getCurrent:()=>current,setCurrent:value=>current=value,settings,audio,render,updateDownload,modal,esc,toast});
let progressTracked=false;
function track(id,type){interaction(id,type).catch(()=>{});}
audio.addEventListener('timeupdate',()=>{if(!progressTracked&&current>=0&&audio.duration>0&&audio.currentTime/audio.duration>=.25){progressTracked=true;track(songs[current].id,'play_25');}});
