import { interaction } from './data';

const counts = new Map();
const liked = new Set();
const pending = new Set();
let notify = () => {};
export function likeState(id) {
  return { count: counts.get(id), liked: liked.has(id), pending: pending.has(id) };
}
export function setLikeCounts(rows) {
  for (const row of rows) counts.set(row.songId, row.likes);
  syncLikes();
}
export function syncLikes() {
  document.querySelectorAll('[data-like]').forEach(button => {
    const state = likeState(button.dataset.like);
    button.textContent = `${state.liked ? '♥ Liked' : '♡ Like'}${state.count === undefined ? '' : ` · ${state.count.toLocaleString()}`}`;
    button.setAttribute('aria-pressed', String(state.liked));
    button.disabled = state.pending || state.liked;
  });
}
export function bindLikes(toast, onLike = () => {}) {
  notify = toast;
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-like]');
    if (!button) return;
    const id = button.dataset.like;
    if (liked.has(id) || pending.has(id)) return;
    pending.add(id); syncLikes();
    try {
      const result = await interaction(id, 'like');
      if (!result) { notify('Likes are available on the deployed site. This preview does not save changes.'); return; }
      if (!Number.isSafeInteger(result.likes) || result.likes < 0) throw new Error('Invalid like count');
      counts.set(id, result.likes); liked.add(id);
      notify('Thanks for the love! ♥');
      onLike();
    } catch { notify('Your like could not be saved. You may have already liked this song recently.'); }
    finally { pending.delete(id); syncLikes(); }
  });
}
