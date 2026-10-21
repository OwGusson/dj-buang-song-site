import {interaction} from './data';
import {syncLikes} from './likes';
export function showDetails(song,{modal,esc,toast,downloadUrl,play}){
 interaction(song.id,'open').catch(()=>{});
 modal(`<div class="eyebrow">DJ-BUANG · THE COLLECTION</div><h2>${esc(song.title)}</h2><p>${esc(song.artist||'DJ-Buang')}</p>${song.credits?`<p class="song-credits">${esc(song.credits)}</p>`:''}<div class="detail-actions"><button class="primary" id="detail-play">Play song ▶</button>${song.downloadable!==false?`<a class="outline" href="${downloadUrl(song)}" download>Download song ↓</a>`:'<span class="studio-help">Available to listen online</span>'}<button class="outline" id="detail-share">Copy song link ↗</button><button class="outline song-like" data-like="${esc(song.id)}" aria-label="Like ${esc(song.title)}" aria-pressed="false">♡ Like</button></div><h3>Lyrics</h3>${song.lyrics?'<button class="text-button" id="lyrics-pdf">Download lyrics PDF ↓</button>':''}<p class="song-lyrics">${esc(song.lyrics||'Lyrics coming soon.')}</p>`);
 document.querySelector('#detail-play').onclick=play;
 document.querySelector('#detail-share').onclick=async()=>{const url=new URL('/',location.origin);url.searchParams.set('song',song.id);try{await navigator.clipboard.writeText(url.href);toast('Song link copied.');}catch{toast('Copy this link: '+url.href);}};
 syncLikes();
 if(song.lyrics)document.querySelector('#lyrics-pdf').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const {jsPDF}=await import('jspdf');const doc=new jsPDF();doc.setFontSize(18);doc.text(song.title,18,22,{maxWidth:174});doc.setFontSize(11);const lines=doc.splitTextToSize(song.lyrics,174);let y=45;for(const line of lines){if(y>278){doc.addPage();y=20;}doc.text(line,18,y);y+=5.5;}doc.save(song.title.replace(/[^\p{L}\p{N} -]/gu,'')+' - Lyrics.pdf');interaction(song.id,'download_lyrics').catch(()=>{});}catch{toast('The lyrics PDF could not be created.');}finally{button.disabled=false;}};
}
