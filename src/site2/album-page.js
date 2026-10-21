import { albumTracks } from './listening-model';

export const albumPath = '/albums/global-barangay';
export function createAlbumPage({ getSongs, getRelease, playAlbum, detail, esc }) {
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
    const tracks = available() ? albumTracks(getSongs()) : [], released = tracks.length > 0;
    announcement.innerHTML = `<span>${released ? '<b>GLOBAL BARANGAY IS OUT NOW</b> · Two worlds. One sound.' : '<b>GLOBAL BARANGAY · COMING OCTOBER 24</b> · Two worlds. One sound.'}</span><a href="${albumPath}">${released ? 'Listen to the album' : 'Explore the album'} ↗</a>`;
    document.querySelector('.hero-copy > .eyebrow').innerHTML = `<span class="signal"></span> ${released ? 'THE NEW DJ-BUANG ALBUM · OUT NOW' : 'A NEW CHAPTER · COMING OCTOBER 24'}`;
    document.querySelector('.hero-foot span:last-child').textContent = released ? 'OUT NOW' : 'COMING OCTOBER 24';
    document.querySelector('#album-open').innerHTML = `Explore the album <span>↗</span>`;
    const primary = document.querySelector('.hero-actions > .primary');
    primary.href = released ? albumPath : '#music'; primary.textContent = released ? 'Listen to Global Barangay ↗' : 'Explore the music ↘';
    document.querySelector('#album-page').innerHTML = `<a class="text-button" href="/#music">← Back to the collection</a><div class="album-page-hero"><img class="album-page-cover" src="/global-barangay-cover.png" alt="Global Barangay — DJ-Buang album cover"><div><div class="eyebrow">DJ-BUANG · ${released ? 'THE ALBUM · OUT NOW' : 'A NEW CHAPTER'}</div><h1>GLOBAL<br><span>BARANGAY</span></h1><p class="album-tagline">Two worlds. One sound.</p><p>A meeting point for the Philippines and Iceland. Different places, shared stories, and the PHIL-ICE spirit—brought together in one global barangay.</p>${released ? `<p>${tracks.length} tracks · DJ-Buang</p><button class="primary" id="album-play-all">Play album ▶</button><p class="studio-help">Play in album order, or turn on shuffle in the player.</p>` : '<span class="coming-label">COMING OCTOBER 24</span><p>Global Barangay arrives here on October 24. The final track list, lyrics, and credits will appear with the release.</p>'}</div></div><div class="album-page-body"><section><div class="eyebrow">${released ? 'PRESS PLAY' : 'THE COLLECTION IS TAKING SHAPE'}</div><h2>${released ? 'The track list.' : 'Your next replay is coming.'}</h2><div class="album-track-list">${released ? tracks.map((song, index) => `<article class="album-track"><button class="track-number" data-album-play="${esc(song.id)}" aria-label="Play ${esc(song.title)}">${String(song.albumTrackNumber || index + 1).padStart(2, '0')} <span>▶</span></button><div><h3>${esc(song.title)}</h3><p>${esc(song.artist || 'DJ-Buang')}${song.credits ? ` · ${esc(song.credits)}` : ''}</p><p class="song-requester">Requested by ${esc(song.requestedBy?.trim() || 'DJ-Buang')}</p></div><button class="queue-add" data-enqueue="${esc(song.id)}" aria-label="Play ${esc(song.title)} next">＋</button><button class="text-button" data-album-details="${esc(song.id)}">Lyrics & credits ↗</button></article>`).join('') : '<p class="album-empty">The songs are being finished. Nothing unreleased is available to stream or download here yet.</p>'}</div></section><aside class="album-story"><div class="eyebrow">BEHIND THE ALBUM</div><h2>A barangay,<br>without borders.</h2><p>Global Barangay connects the warm energy of the Philippines with the Icelandic side of DJ-Buang. It is a collection to listen to together, wherever you call home.</p><strong>Turn the Buang On!</strong></aside></div>`;
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
