import { catalog, interaction } from './data';
import { createStudio } from './studio';
import { supabase } from '../supabase';
export function connect({detail,$,getSongs,setSongs,getCurrent,setCurrent,settings,audio,render,updateDownload,modal,esc,toast,onCatalogReady}){
 let catalogEpoch=0;
 let sharedOpened=false;
 async function refreshCatalog(){
   const epoch=++catalogEpoch;
   try{
     const next=await catalog();if(epoch!==catalogEpoch)return;
     const currentId=getSongs()[getCurrent()]?.id;
     const songs=next.filter(s=>s.visibility==='public'&&(!s.status||s.status==='published'));
     setSongs(songs);settings.clear();songs.forEach(s=>settings.set(s.id,s.downloadable!==false));
     const current=currentId?songs.findIndex(s=>s.id===currentId):-1;setCurrent(current);
     if(current<0&&currentId){audio.pause();audio.removeAttribute('src');audio.load();$('#player-title').textContent='Choose your next song';$('#player-artist').textContent='DJ-Buang';$('#player-cover').hidden=true;}
     render();updateDownload();
     onCatalogReady?.();
     const sharedId=new URLSearchParams(location.search).get('song');
     if(sharedId&&!sharedOpened){sharedOpened=true;const song=songs.find(s=>s.id===sharedId);if(song)detail(song);else modal('<h2>Song unavailable</h2><p>This song may be private or no longer available.</p><a class="outline" href="/studio/classic?'+new URLSearchParams({song:sharedId}).toString()+'">Administrator access ↗</a>');}
   }catch(error){$('#empty').hidden=false;$('#empty').textContent=error.message;$('#song-count').textContent='Library unavailable';toast(error.message);}
 }
 const studio=createStudio({modal,esc,toast,onCatalog:refreshCatalog});
 const openStudio=()=>{if(location.pathname!=='/studio')history.pushState(null,'','/studio'+location.search);return studio.open();};
 $('#admin-open').onclick=openStudio;
 $('#modal').addEventListener('close',()=>{if(!$('#modal').open&&location.pathname==='/studio')history.replaceState(null,'','/'+location.search);});
 window.addEventListener('popstate',()=>{if(location.pathname==='/studio')studio.open();else if($('#modal').open)$('#modal').close();});
 $('#modal-content').addEventListener('click',event=>{const link=event.target.closest('a[download]');if(link){const id=new URL(link.href).searchParams.get('id');if(id)interaction(id,'download_song').catch(()=>{});}});
 audio.addEventListener('error',()=>toast('This audio file could not be played. Please try another song.'));
 if(import.meta.env.DEV)document.body.insertAdjacentHTML('afterbegin','<div class="preview-bar">DJ-BUANG 2.0 · DEVELOPMENT PREVIEW <span>Production writes are disabled</span></div>');
 supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')location.assign('/studio/classic'+location.hash);});
 const ready=refreshCatalog();
 if(location.pathname==='/studio')openStudio();
 return ready;
}
