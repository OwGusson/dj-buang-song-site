export function finishedSongSupportHint(thread,supportEnabled=false){
 if(thread?.kind!=='request'||thread.status!=='done'||!thread.linked_song_id)return '';
 return `<aside class="finished-song-support"><h3>Enjoying your song?</h3><p>Consider supporting DJ-Buang. Your support helps pay for better music tools and software, so I can keep improving the music.</p><p class="studio-help">Support is completely optional and does not affect your song, request, or access. Listening and sharing are appreciated too.</p>${supportEnabled?'<button class="outline" id="request-support">Support DJ-Buang ♡</button>':''}</aside>`;
}
