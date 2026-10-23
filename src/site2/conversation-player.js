import { listener } from './listener';

export function mountConversationPlayer(container, { id, song, esc, isCurrent = () => true }) {
  let disposed = false;
  const urls = new Set(), controller = new AbortController();
  container.innerHTML = `<h3>Your finished song</h3><p><strong>${esc(song.title)}</strong> · ${esc(song.artist)}</p><button class="outline" id="listen-finished-song">Listen to your song ▶</button><div id="finished-song-player"></div><p class="studio-help">Listening is available inside your private conversation. A linked song does not change your sharing permissions.</p><p id="finished-song-error" role="alert"></p>`;
  const button = container.querySelector('button');
  async function media(asset) {
    const { data: { session } } = await listener.auth.getSession();
    if (!session?.access_token) throw Error('Sign in to your inbox again to listen.');
    const response = await fetch('/api/conversation-song?' + new URLSearchParams({ id, asset }), { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw Error('This song could not be loaded. Please try again.');
    if (!(response.headers.get('Content-Type') || '').startsWith('audio/')) throw Error('Sign in to the protected preview again, then retry.');
    const blob = await response.blob();
    if (disposed || !isCurrent()) throw Error('Conversation closed.');
    const url = URL.createObjectURL(blob); urls.add(url); return url;
  }
  button.onclick = async () => {
    button.disabled = true; button.textContent = 'Loading your song…';
    try {
      const src = await media('audio'); if (disposed || !isCurrent()) return;
      const audio = document.createElement('audio'); audio.controls = true; audio.setAttribute('controlsList', 'nodownload'); audio.style.width = '100%'; audio.src = src; audio.setAttribute('aria-label', 'Your finished song: ' + song.title);
      container.querySelector('#finished-song-player').append(audio); button.hidden = true;
      document.querySelector('#audio')?.pause();
      await audio.play().catch(() => {});
    } catch (error) {
      if (disposed || !isCurrent()) return;
      container.querySelector('#finished-song-error').textContent = error.message; button.disabled = false; button.textContent = 'Listen to your song ▶';
    }
  };
  return () => { disposed = true; controller.abort(); container.querySelector('audio')?.pause(); for (const url of urls) URL.revokeObjectURL(url); };
}
