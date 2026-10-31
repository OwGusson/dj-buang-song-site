import { albumTracks } from './listening-model';

const durationLabel=seconds=>{const total=Math.round(seconds);return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;};
export const albumPath = '/albums/global-barangay';
const spotifyPreSaveUrl = 'https://distrokid.com/hyperfollow/djbuang/global-barangay';
export function createAlbumPage({ getSongs, getRelease, getPreview=()=>false, getAlbum=()=>({status:'available'}), playAlbum, detail, esc }) {
  const main = document.querySelector('main');
  main.insertAdjacentHTML('beforeend', '<section id="album-page" class="album-page" aria-label="Global Barangay album"></section>');
  document.querySelector('nav a[href="#album"]').href = albumPath;
  document.querySelector('header .brand').href = '/';
  document.querySelector('#album-open').dataset.albumOpen = 'true';
  const announcement = document.createElement('section');
  announcement.className = 'release-announcement'; announcement.setAttribute('aria-label', 'Album announcement');
  main.querySelector('.brand-stage').before(announcement);
  function available() { return getRelease() && albumTracks(getSongs()).length > 0; }
  function render() {
    const settings=getAlbum(), hidden=['draft','hidden'].includes(settings.status), platforms=settings.status==='platforms';
    const hero=document.querySelector('#album');hero.hidden=hidden;announcement.hidden=hidden;
    document.querySelector('nav a[href="'+albumPath+'"]').hidden=hidden;
    if(hidden){document.querySelector('#album-page').innerHTML='<a class="text-button" href="/#music">← Back to the collection</a><h1>Album unavailable</h1><p>This album is not currently available here.</p>';return;}
    if(platforms){
      const links=Object.entries(settings.links||{}).map(([name,url])=>`<a class="primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc({spotify:'Spotify',apple:'Apple Music',youtube:'YouTube Music'}[name]||name)} ↗</a>`).join('');
      const list=(settings.tracks||[]).map((song,index)=>`<article class="album-track"><span>${String(song.albumTrackNumber||index+1).padStart(2,'0')}</span><div><h3>${esc(song.title)}</h3><p>${esc(song.artist||'DJ-Buang')}${song.credits?' · '+esc(song.credits):''}</p></div></article>`).join('');
      announcement.innerHTML=`<span><b>GLOBAL BARANGAY</b> · Listen on streaming platforms.</span><a href="${albumPath}">Explore the album ↗</a>`;
      document.querySelector('.hero-copy > .eyebrow').textContent='GLOBAL BARANGAY · ON STREAMING PLATFORMS';
      document.querySelector('.hero-foot span:last-child').textContent='ON STREAMING PLATFORMS';
      const primary=document.querySelector('.hero-actions > .primary');primary.href=albumPath;primary.textContent='Find streaming links ↗';
      document.querySelector('#album-page').innerHTML=`<a class="text-button" href="/#music">← Back to the collection</a><div class="album-page-hero"><img class="album-page-cover" src="${esc(settings.coverUrl||'/global-barangay-cover.png')}" alt="Global Barangay album cover"><div><div class="eyebrow">DJ-BUANG · THE ALBUM</div><h1>GLOBAL<br><span>BARANGAY</span></h1><p class="album-tagline">Two worlds. One sound.</p><p>${esc(settings.story||'')}</p><p>Listen on your favourite streaming platform. Website playback is currently unavailable.</p><div class="platform-links">${links}</div></div></div><h2>The track list.</h2>${list}`;return;
    }

    const tracks = available() ? albumTracks(getSongs()) : [], released = tracks.length > 0, localPreview=getPreview();
    const durationKnown=tracks.length>0&&tracks.every(song=>Number.isFinite(song.durationSeconds)&&song.durationSeconds>0);
    const totalSeconds=tracks.reduce((total,song)=>total+(song.durationSeconds||0),0);
    announcement.innerHTML = `<span>${released ? (localPreview ? '<b>GLOBAL BARANGAY · PRIVATE ALBUM PREVIEW</b> · Not published.' : '<b>GLOBAL BARANGAY IS OUT NOW</b> · Two worlds. One sound.') : '<b>GLOBAL BARANGAY · COMING OCTOBER 24</b> · Two worlds. One sound.'}</span><div class="release-announcement-actions"><a href="${albumPath}">${released ? 'Listen to the album' : 'Explore the album'} ↗</a>${released&&!localPreview?`<a class="spotify-presave-link" href="${spotifyPreSaveUrl}" target="_blank" rel="noopener noreferrer">Pre-save on Spotify ↗</a>`:''}</div>`;
    document.querySelector('.hero-copy > .eyebrow').innerHTML = `<span class="signal"></span> ${released ? (localPreview ? 'PRIVATE ALBUM PREVIEW · NOT PUBLISHED' : 'THE NEW DJ-BUANG ALBUM · OUT NOW') : 'A NEW CHAPTER · COMING OCTOBER 24'}`;
    document.querySelector('.hero-foot span:last-child').textContent = released ? (localPreview ? 'PRIVATE PREVIEW' : 'OUT NOW') : 'COMING OCTOBER 24';
    document.querySelector('#album-open').innerHTML = `Explore the album <span>↗</span>`;
    const primary = document.querySelector('.hero-actions > .primary');
    primary.href = released ? albumPath : '#music'; primary.textContent = released ? 'Listen to Global Barangay ↗' : 'Explore the music ↘';
    document.querySelector('#album-page').innerHTML = `<a class="text-button" href="/#music">← Back to the collection</a><div class="album-page-hero"><img class="album-page-cover" src="/global-barangay-cover.png" alt="Global Barangay — DJ-Buang album cover"><div><div class="eyebrow">DJ-BUANG · ${released ? (localPreview ? 'THE ALBUM · PRIVATE PREVIEW' : 'THE ALBUM · OUT NOW') : 'A NEW CHAPTER'}</div><h1>GLOBAL<br><span>BARANGAY</span></h1><p class="album-tagline">Two worlds. One sound.</p><p>A meeting point for the Philippines and Iceland. Different places, shared stories, and the PHIL-ICE spirit—brought together in one global barangay.</p>${released ? `<p>${tracks.length} tracks${durationKnown ? ` · ${durationLabel(totalSeconds)} total` : ''} · DJ-Buang</p><div class="album-launch-actions"><button class="primary" id="album-play-all">Play album ▶</button>${localPreview?'':`<a class="outline spotify-presave-link" href="${spotifyPreSaveUrl}" target="_blank" rel="noopener noreferrer">Pre-save on Spotify ↗</a>`}</div>${localPreview?'':'<p class="studio-help">Streaming release coming soon. Listen here now.</p>'}<p class="studio-help">Play in album order, or turn on shuffle in the player.</p>` : '<span class="coming-label">COMING OCTOBER 24</span><p>Global Barangay arrives here on October 24. The final track list, lyrics, and credits will appear with the release.</p>'}</div></div><div class="album-page-body"><section><div class="eyebrow">${released ? 'PRESS PLAY' : 'THE COLLECTION IS TAKING SHAPE'}</div><h2>${released ? 'The track list.' : 'Your next replay is coming.'}</h2><div class="album-track-list">${released ? tracks.map((song, index) => `<article class="album-track"><button class="track-number" data-album-play="${esc(song.id)}" aria-label="Play ${esc(song.title)}"><img class="album-track-art" src="${esc(song.coverUrl||'/global-barangay-cover.png')}" alt="" loading="lazy">${String(song.albumTrackNumber || index + 1).padStart(2, '0')} <span>▶</span></button><div><h3>${esc(song.title)}${Number.isFinite(song.durationSeconds)&&song.durationSeconds>0 ? `<span class="track-duration" aria-label="Duration ${durationLabel(song.durationSeconds)}">${durationLabel(song.durationSeconds)}</span>` : ''}</h3><p>${esc(song.artist || 'DJ-Buang')}${song.credits ? ` · ${esc(song.credits)}` : ''}</p>${song.requestedBy?.trim() && !/^dj[\s-]*buang$/i.test(song.requestedBy.trim()) ? `<p class="song-requester">Requested by ${esc(song.requestedBy.trim())}</p>` : ''}</div><button class="queue-add" data-enqueue="${esc(song.id)}" aria-label="Play ${esc(song.title)} next">＋</button><button class="text-button" data-album-details="${esc(song.id)}">Lyrics & credits ↗</button></article>`).join('') : '<p class="album-empty">The songs are being finished. Nothing unreleased is available to stream or download here yet.</p>'}</div></section><aside class="album-story"><div class="eyebrow">BEHIND THE ALBUM</div><h2>A barangay,<br>without borders.</h2><p>Global Barangay connects the warm energy of the Philippines with the Icelandic side of DJ-Buang. It is a collection to listen to together, wherever you call home.</p><strong>Turn the Buang On!</strong></aside></div>`;
    if(settings.coverUrl){document.querySelector('#album-page .album-page-cover').src=settings.coverUrl;document.querySelector('.hero-art img').src=settings.coverUrl;}
    if(settings.story){const intro=document.querySelector('#album-page .album-tagline + p');if(intro)intro.textContent=settings.story;}
    if(Object.keys(settings.links||{}).length){const holder=document.createElement('div');holder.className='platform-links';holder.innerHTML=Object.entries(settings.links).map(([name,url])=>`<a class="outline" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc({spotify:'Spotify',apple:'Apple Music',youtube:'YouTube Music'}[name]||name)} ↗</a>`).join('');document.querySelector('#album-page .album-page-hero > div').append(holder);}
    document.querySelector('#album-play-all')?.addEventListener('click', () => playAlbum(tracks));
  }
  function route() {
    const active = location.pathname === albumPath;
    main.classList.toggle('album-view', active);
    document.title = active ? 'Global Barangay — DJ-Buang' : 'DJ-Buang — Turn the Buang On!';
  }
  function open() {
    document.querySelector('#modal').close();
    if (location.pathname !== albumPath) history.pushState(null, '', albumPath);
    render(); route(); window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector('#album-page h1').setAttribute('tabindex', '-1'); document.querySelector('#album-page h1').focus({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const albumLink = event.target.closest(`[data-album-open],a[href="${albumPath}"]`);
    if (albumLink && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); open(); return; }
    const play = event.target.closest('[data-album-play]');
    if (play) { const tracks = albumTracks(getSongs()); playAlbum(tracks, play.dataset.albumPlay); return; }
    const lyrics = event.target.closest('[data-album-details]');
    if (lyrics) { detail(getSongs().find(song => song.id === lyrics.dataset.albumDetails)); return; }
    const link = event.target.closest('a');
    if ((location.pathname === albumPath || link?.matches('header .brand')) && link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      const url = new URL(link.href);
      if (url.origin === location.origin && (url.pathname === '/' || (url.pathname === albumPath && url.hash))) {
        event.preventDefault(); history.pushState(null, '', '/' + url.hash); route();
        document.querySelector('#modal').close();
        if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView(); else window.scrollTo({ top: 0 });
      }
    }
  });
  window.addEventListener('popstate', route);
  render(); route();
  return { render, open, available };
}
