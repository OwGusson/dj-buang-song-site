export function createPlaybackProgress(durationSeconds) {
  return {
    durationSeconds:Number.isFinite(durationSeconds)&&durationSeconds>0?durationSeconds:0,
    listenedSeconds:0,
    lastMediaSeconds:null,
    lastWallSeconds:null,
    seeking:false,
    sent:new Set(),
  };
}

export function resetPlaybackSample(state, {mediaSeconds = null, wallSeconds = null, seeking = state.seeking} = {}) {
  state.lastMediaSeconds = Number.isFinite(mediaSeconds) ? mediaSeconds : null;
  state.lastWallSeconds = Number.isFinite(wallSeconds) ? wallSeconds : null;
  state.seeking = seeking;
}

export function observePlayback(state, {mediaSeconds, wallSeconds, playbackRate = 1, paused = false, seeking = false} = {}) {
  if (!Number.isFinite(mediaSeconds)||!Number.isFinite(wallSeconds)||!state.durationSeconds) return [];
  if (paused||seeking||state.seeking) {
    state.lastMediaSeconds=mediaSeconds;
    state.lastWallSeconds=wallSeconds;
    if (seeking) state.seeking=true;
    return [];
  }
  if (state.lastMediaSeconds!==null&&state.lastWallSeconds!==null) {
    const elapsed = wallSeconds-state.lastWallSeconds;
    const moved = mediaSeconds-state.lastMediaSeconds;
    const rate = Number.isFinite(playbackRate)&&playbackRate>0?playbackRate:1;
    const expected = elapsed*rate;
    // Count only media-time advancement consistent with elapsed playing time.
    // A seek jump has a much larger media delta than elapsed wall time.
    const plausible = elapsed>0&&moved>=0&&Math.abs(moved-expected)<=Math.max(1.25,expected*0.2);
    if (plausible) state.listenedSeconds += Math.min(moved,expected+0.5);
  }
  resetPlaybackSample(state,{mediaSeconds,wallSeconds,seeking:false});
  const progress = state.listenedSeconds/state.durationSeconds;
  const reached=[];
  for (const [threshold,eventType] of [[0.25,'play_25'],[0.5,'play_50'],[0.75,'play_75']]) {
    if (progress>=threshold&&!state.sent.has(eventType)) {
      state.sent.add(eventType);
      reached.push(eventType);
    }
  }
  return reached;
}

export function playbackFinished(state) {
  return state.durationSeconds>0&&state.listenedSeconds>=state.durationSeconds*0.95;
}
