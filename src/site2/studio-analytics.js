import {studioRows} from './data';
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
   const [events,likes]=await Promise.all([
    studioRows('events',{start:window.start,end:window.end}),
    studioRows('likes')
   ]);
   if(!panel.isConnected||current!==generation)return;
   summary=summarizeAnalytics({songs,totals,events,likes,window});draw(window);
  }catch(error){if(panel.isConnected&&current===generation){target.innerHTML=`<p role="alert">${esc(error.message)}</p><button class="outline" id="retry-analytics">Try again</button>`;target.querySelector('button').onclick=load;}}
 }
 function draw(window){
  const total=summary.totals,max=Math.max(1,...summary.daily.map(day=>day.plays));
  target.innerHTML=`<div class="metric-grid">${[['plays','Plays'],['song_downloads','Song downloads'],['lyrics_downloads','Lyrics downloads'],['opens','Song detail opens']].map(([key,label])=>`<div><strong>${total[key].toLocaleString()}</strong><span>${label}</span></div>`).join('')}</div><p class="studio-help">${window.period==='all'?'All-time totals use the stored counters; the chart shows the last 90 days of dated events.':'Totals and chart use timestamped events within the selected period.'} Likes are lifetime totals because historical likes have no individual timestamps. No listener identifiers are loaded.</p><section class="analytics-chart" aria-label="Daily plays"><h4>Daily plays${window.period==='all'?' · last 90 days':''}</h4><p class="studio-help">${esc(window.start.slice(0,10))} through ${esc(window.end.slice(0,10))}</p><div class="daily-bars" role="img" aria-label="Daily plays chart. Exact daily counts are in the table below.">${summary.daily.map(day=>`<div class="daily-bar" title="${day.day}: ${day.plays} plays"><span style="height:${Math.round(day.plays/max*100)}%"></span></div>`).join('')}</div>${summary.daily.every(day=>day.plays===0)?'<p>No dated play events in this period.</p>':''}<details><summary>Daily counts</summary><div class="daily-counts">${summary.daily.map(day=>`<div><time>${day.day}</time><strong>${day.plays} plays</strong></div>`).join('')}</div></details></section><div class="studio-tools"><h4>Song rankings</h4><label class="field compact">Rank by<select id="analytics-sort"><option value="plays">Plays</option><option value="song_downloads">Song downloads</option><option value="lyrics_downloads">Lyrics downloads</option><option value="likes">Likes · all time</option></select></label></div><div id="song-rankings"></div><h4>Album rankings</h4><div id="album-rankings"></div>`;
  const sort=target.querySelector('#analytics-sort');
  const metrics=row=>`<div class="ranking-metrics"><span><b>${row.plays}</b> plays</span><span><b>${row.song_downloads}</b> song downloads</span><span><b>${row.lyrics_downloads}</b> lyric downloads</span><span><b>${row.likes}</b> likes · all time</span></div>`;
  const rank=()=>{
   const key=sort.value;
   target.querySelector('#song-rankings').innerHTML=[...summary.tracks].sort((a,b)=>b[key]-a[key]||a.song.title.localeCompare(b.song.title)).map((row,index)=>`<article class="analytics-ranking"><strong>${index+1}. ${esc(row.song.title)}</strong><small>${esc(row.song.albumId==='global-barangay'?'Global Barangay':row.song.albumId||'Standalone song')} · ${esc(row.song.visibility||'private')}</small>${metrics(row)}</article>`).join('')||'<p>No songs in the library.</p>';
   target.querySelector('#album-rankings').innerHTML=[...summary.albums].sort((a,b)=>b[key]-a[key]||a.title.localeCompare(b.title)).map((row,index)=>`<article class="analytics-ranking"><strong>${index+1}. ${esc(row.title)}</strong><small>${row.tracks} tracks in your library</small>${metrics(row)}</article>`).join('')||'<p>No album tracks are in this deployed library yet. Rankings will appear when the tracks are added.</p>';
  };sort.onchange=rank;rank();
 }
 period.onchange=load;await load();
}
