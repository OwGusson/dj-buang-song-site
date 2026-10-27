import {studioRows,studioAudience} from './data';
import {verifyAdmin} from '../adminAuth';
import {analyticsWindow,summarizeAnalytics} from './analytics-model';
export async function renderStudioAnalytics(panel,{songs,totals,esc}){
 let generation=0,summary;
 panel.innerHTML=`<div class="studio-tools"><h3>Music analytics</h3><label class="field compact">Period<select id="analytics-period"><option value="today">Today</option><option value="week" selected>Last 7 days</option><option value="month">Last 30 days</option><option value="all">All time</option></select></label></div><p class="studio-help">Calendar days use Iceland time (UTC). Current library only; deleted songs are excluded. Plays count playback starts, including repeats.</p><div id="analytics-content" aria-live="polite"></div>`;
 const target=panel.querySelector('#analytics-content'),period=panel.querySelector('#analytics-period');
 async function load(){
  const current=++generation;target.innerHTML='<p>Loading analytics…</p>';
  try{
   await verifyAdmin();const window=analyticsWindow(period.value);
   const [events,likes,audience]=await Promise.all([
    studioRows('events',{start:window.start,end:window.end}),
    studioRows('likes'),
    studioAudience({start:window.start,end:window.end})
   ]);
   if(!panel.isConnected||current!==generation)return;
   summary=summarizeAnalytics({songs,totals,events,likes,audience,window});draw(window);
  }catch(error){if(panel.isConnected&&current===generation){target.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="outline" id="retry-analytics">Try again</button>`;target.querySelector('button').onclick=load;}}
 }
 function draw(window){
  const total=summary.totals,max=Math.max(1,...summary.daily.map(day=>day.plays));
  const audience=summary.audience,peakDay=audience.peakDay,peakHour=audience.peakHour;
  const periodLabel=window.period==='all'?'Last 90 days':window.period==='today'?'Today':window.period==='week'?'Last 7 days':'Last 30 days';
  target.innerHTML=`<p class="studio-help">${periodLabel} · Dates and hours use Iceland time (UTC). Plays count starts, including repeats and queued tracks.</p><div class="metric-grid">${[['plays','Plays',total.plays],['unique','Estimated listeners',audience.uniqueListeners],['returning','Multiple play starts',audience.returningListeners],['peak','Busiest day',peakDay?esc(peakDay.day):'—'],['hour','Peak listening hour',peakHour?`${String(peakHour.hour).padStart(2,'0')}:00–${String((peakHour.hour+1)%24).padStart(2,'0')}:00`: '—'],['song_downloads','Song downloads',total.song_downloads],['lyrics_downloads','Lyrics downloads',total.lyrics_downloads],['opens','Song detail opens',total.opens]].map(([key,label,value])=>`<div><strong class="${key==='peak'||key==='hour'?'metric-text':''}">${typeof value==='number'?value.toLocaleString():value}</strong><span>${label}</span></div>`).join('')}</div><p class="studio-help">Estimated listeners are unique network hashes, not verified people. Shared Wi‑Fi may count multiple listeners once; changing networks may count one listener more than once. “Multiple play starts” counts a network with 2+ starts, including queued tracks. Only aggregate numbers reach this dashboard; identifiers stay server-side. ${window.period==='all'?'Audience and dated event insights cover the last 90 days; all-time play/download totals use stored counters.':'Play and audience insights use events in the selected period.'} Likes are lifetime totals.</p><section class="analytics-chart" aria-label="Daily plays"><h4>Daily plays${window.period==='all'?' · last 90 days':''}</h4><p class="studio-help">${esc(window.start.slice(0,10))} through ${esc(window.end.slice(0,10))}</p><div class="daily-bars" role="img" aria-label="Daily plays chart. Exact daily counts are in the table below.">${summary.daily.map(day=>`<div class="daily-bar" title="${day.day}: ${day.plays} plays"><span style="height:${Math.round(day.plays/max*100)}%"></span></div>`).join('')}</div>${summary.daily.every(day=>day.plays===0)?'<p>No dated play events in this period.</p>':''}<details><summary>Daily counts</summary><div class="daily-counts">${summary.daily.map(day=>`<div><time>${day.day}</time><strong>${day.plays} plays</strong></div>`).join('')}</div></details></section><section class="analytics-chart"><h4>Album journey</h4><p class="studio-help">Estimated networks that started track 1 and also played each track in order during this period. Not a single-session completion measure.</p>${audience.albumJourney?.map(album=>`<div class="album-journey"><h5>${esc(album.title)} <small>${album.cohortSize.toLocaleString()} track 1 starts</small></h5>${album.tracks.map(track=>`<div class="journey-track"><span>${track.trackNumber}. ${esc(track.title)}</span><strong>${track.listeners.toLocaleString()} · ${track.rate}%</strong><i><b style="width:${track.rate}%"></b></i></div>`).join('')}</div>`).join('')||'<p>No published album tracks with track numbers yet.</p>'}</section><div class="studio-tools"><h4>Song rankings</h4><label class="field compact">Rank by<select id="analytics-sort"><option value="plays">Plays</option><option value="replaysPerListener">Replays per estimated listener</option><option value="uniqueListeners">Estimated listeners</option><option value="song_downloads">Song downloads</option><option value="lyrics_downloads">Lyrics downloads</option><option value="likes">Likes · all time</option></select></label></div><div id="song-rankings"></div><h4>Album rankings</h4><div id="album-rankings"></div>`;
  const sort=target.querySelector('#analytics-sort');
  const metrics=row=>`<div class="ranking-metrics"><span><b>${row.plays}</b> play starts</span><span><b>${row.uniqueListeners}</b> estimated listeners</span><span><b>${row.replaysPerListener.toFixed(1)}</b> starts per listener</span><span><b>${row.likes}</b> likes · all time</span><span><b>${row.song_downloads}</b> song downloads</span><span><b>${row.lyrics_downloads}</b> lyric downloads</span></div>`;
  const albumMetrics=row=>`<div class="ranking-metrics"><span><b>${row.plays}</b> play starts</span><span><b>${row.song_downloads}</b> song downloads</span><span><b>${row.lyrics_downloads}</b> lyric downloads</span><span><b>${row.likes}</b> likes · all time</span></div>`;
  const rank=()=>{
   const key=sort.value;
   target.querySelector('#song-rankings').innerHTML=[...summary.tracks].sort((a,b)=>b[key]-a[key]||a.song.title.localeCompare(b.song.title)).map((row,index)=>`<article class="analytics-ranking"><strong>${index+1}. ${esc(row.song.title)}</strong><small>${esc(row.song.albumId==='global-barangay'?'Global Barangay':row.song.albumId||'Standalone song')} · ${esc(row.song.visibility||'private')}</small>${metrics(row)}</article>`).join('')||'<p>No songs in the library.</p>';
   const albumKey=['uniqueListeners','replaysPerListener'].includes(key)?'plays':key;
   target.querySelector('#album-rankings').innerHTML=[...summary.albums].sort((a,b)=>b[albumKey]-a[albumKey]||a.title.localeCompare(b.title)).map((row,index)=>`<article class="analytics-ranking"><strong>${index+1}. ${esc(row.title)}</strong><small>${row.tracks} tracks in your library</small>${albumMetrics(row)}</article>`).join('')||'<p>No album tracks are in this deployed library yet. Rankings will appear when the tracks are added.</p>';
  };sort.onchange=rank;rank();
 }
 period.onchange=load;await load();
}
