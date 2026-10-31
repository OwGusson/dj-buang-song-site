export const ALBUM_ID = 'global-barangay';
export function albumTracks(songs) {
  return songs.filter(song => song.albumId === ALBUM_ID && song.visibility === 'public' && (!song.status || song.status === 'published'))
    .sort((a, b) => (a.albumTrackNumber || 999) - (b.albumTrackNumber || 999) || a.title.localeCompare(b.title));
}
export function rankTracks(songs, statistics, metric, limit = 3) {
  const counts = new Map(statistics.map(row => [row.songId, Number(row[metric]) || 0]));
  return songs.filter(song => song.visibility === 'public' && (!song.status || song.status === 'published') && counts.get(song.id) > 0)
    .map(song => ({ song, count: counts.get(song.id) }))
    .sort((a, b) => b.count - a.count || a.song.title.localeCompare(b.song.title)).slice(0, limit);
}

// Browser-session queue only. It never writes to an account or the catalog.
export class ListeningQueue {
  ids = []; position = -1; shuffled = false; original = []; priority = 0;
  start(ids, selected = ids[0]) {
    this.ids = [...new Set(ids)]; this.original = [...this.ids];
    this.position = this.ids.indexOf(selected); this.shuffled = false; this.priority = 0;
    return this.current();
  }
  current() { return this.ids[this.position] || null; }
  next() {
    if (this.position + 1 >= this.ids.length) return null;
    this.priority = Math.max(0, this.priority - 1);
    return this.ids[++this.position];
  }
  previous() { this.priority = 0; if (this.position > 0) this.position--; return this.current(); }
  choose(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.ids.length) return null;
    this.priority = 0; this.position = index; return this.current();
  }
  enqueue(id) {
    if (id === this.current()) return false;
    const existing = this.ids.indexOf(id, this.position + 1);
    if (existing >= 0) {
      if (existing <= this.position + this.priority) return false;
      this.ids.splice(existing, 1);
    }
    this.ids.splice(this.position + 1 + this.priority, 0, id); this.priority++;
    if (!this.original.includes(id)) this.original.push(id);
    return true;
  }
  remove(index) {
    if (!Number.isInteger(index) || index <= this.position || index >= this.ids.length) return false;
    if (index <= this.position + this.priority) this.priority--;
    this.ids.splice(index, 1); return true;
  }
  clearCurrent() {
    if (this.position < 0 || this.position >= this.ids.length) return false;
    this.ids = this.ids.slice(this.position + 1);
    this.original = [...this.ids];
    this.position = -1; this.priority = 0; this.shuffled = false;
    return true;
  }
  clearUpcoming() {
    const before = this.ids.length;
    this.ids = this.ids.slice(0, this.position + 1);
    this.original = [...this.ids]; this.priority = 0; this.shuffled = false;
    return before - this.ids.length;
  }
  shuffle(random = Math.random) {
    this.shuffled = !this.shuffled; this.priority = 0;
    const rest = this.ids.slice(this.position + 1);
    if (this.shuffled) {
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]];
      }
    } else rest.sort((a, b) => this.original.indexOf(a) - this.original.indexOf(b));
    this.ids = [...this.ids.slice(0, this.position + 1), ...rest];
    return this.shuffled;
  }
  reconcile(validIds) {
    const valid = new Set(validIds), current = this.current();
    if (current && !valid.has(current)) { this.ids = this.ids.slice(this.position + 1).filter(id => valid.has(id)); this.position = -1; }
    else { this.ids = this.ids.filter(id => valid.has(id)); this.position = current ? this.ids.indexOf(current) : -1; }
    this.original = this.original.filter(id => valid.has(id)); this.priority = 0;
  }
}
