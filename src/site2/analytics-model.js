const DAY=86400000;
export function analyticsWindow(period,now=new Date()){
 const end=new Date(now),today=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate()));
 const days={today:1,week:7,month:30,all:90}[period];if(!days)throw Error('Invalid analytics period');
 return {period,start:new Date(+today-(days-1)*DAY).toISOString(),end:end.toISOString(),days};
}
const count=value=>Math.max(0,Number(value)||0);
export function summarizeAnalytics({songs,totals=[],likes=[],events=[],audience={},window,includeQA=false}){
 const rows=new Map(songs.map(song=>[song.id,{song,plays:0,periodPlays:0,measuredPlays:0,reached25:0,reached50:0,reached75:0,finished:0,song_downloads:0,lyrics_downloads:0,opens:0,legacyOpens:0,legacyNetworkListeners:0,likes:count(likes.find(row=>row.song_id===song.id)?.likes)}]));
 const daily=new Map();for(let i=0;i<window.days;i++)daily.set(new Date(Date.parse(window.start)+i*DAY).toISOString().slice(0,10),0);
 const progressFields={play_25:'reached25',play_50:'reached50',play_75:'reached75',play_finished:'finished'};
 const seen=new Set();
 for(const event of events){const row=rows.get(event.song_id),time=Date.parse(event.created_at);if(!row||!Number.isFinite(time)||time<Date.parse(window.start)||time>=Date.parse(window.end))continue;
  const scope=event.traffic_scope||(Number(event.measurement_version)===2?'public':'legacy');
  if(scope==='admin'||(scope==='qa'&&!includeQA))continue;
  const unique=event.event_id||event.id||(event.measurement_version===2&&event.playback_id?`${event.playback_id}:${event.event_type}`:null);if(unique&&seen.has(unique))continue;if(unique)seen.add(unique);
  const measured=Number(event.measurement_version)===2&&['public','qa'].includes(scope);
  if(event.event_type==='play_start'){row.periodPlays++;if(window.period!=='all')row.plays++;if(measured)row.measuredPlays++;}
  if(Number(event.measurement_version)===2&&['public','qa'].includes(scope)&&progressFields[event.event_type])row[progressFields[event.event_type]]++;
  if(event.event_type==='download_song')row.song_downloads++;
  if(event.event_type==='download_lyrics')row.lyrics_downloads++;
  if(event.event_type==='song_detail_open'&&Number(event.measurement_version)===2&&['public','qa'].includes(scope))row.opens++;
  if(event.event_type==='open')row.legacyOpens++;
  if(event.event_type==='play_start'){const day=new Date(time).toISOString().slice(0,10);if(daily.has(day))daily.set(day,daily.get(day)+1);}
 }
 if(window.period==='all')for(const total of totals){const row=rows.get(total.song_id);if(row){for(const field of ['plays','song_downloads','lyrics_downloads'])row[field]=count(total[field]);row.legacyOpens=count(total.opens);}}
 const tracks=[...rows.values()].map(row=>{const uniqueListeners=count(audience.trackListeners?.[row.song.id]);return {...row,uniqueListeners,legacyNetworkListeners:count(audience.trackLegacyNetworkListeners?.[row.song.id]),replaysPerListener:uniqueListeners?row.measuredPlays/uniqueListeners:0,completionRate:row.measuredPlays?row.finished/row.measuredPlays:0};}),albums=new Map();
 for(const row of tracks){if(!row.song.albumId)continue;const id=row.song.albumId;if(!albums.has(id))albums.set(id,{id,title:id==='global-barangay'?'Global Barangay':id,tracks:0,plays:0,periodPlays:0,reached25:0,reached50:0,reached75:0,finished:0,song_downloads:0,lyrics_downloads:0,likes:0,legacyNetworkListeners:0});const album=albums.get(id);album.tracks++;for(const field of ['plays','periodPlays','reached25','reached50','reached75','finished','song_downloads','lyrics_downloads','likes','legacyNetworkListeners'])album[field]+=row[field];}
 const sum=field=>tracks.reduce((total,row)=>total+row[field],0);
 return {tracks,albums:[...albums.values()],daily:[...daily].map(([day,plays])=>({day,plays})),audience,totals:Object.fromEntries(['plays','periodPlays','reached25','reached50','reached75','finished','song_downloads','lyrics_downloads','opens','legacyOpens','legacyNetworkListeners','likes'].map(field=>[field,sum(field)]))};
}
export async function readAnalyticsPages(makeQuery){
 const rows=[];for(let offset=0;offset<50000;offset+=1000){const {data,error}=await makeQuery().range(offset,offset+999);if(error||!Array.isArray(data))throw Error('Dated analytics could not be loaded. Please try again.');rows.push(...data);if(data.length<1000)return rows;}
 throw Error('This date range has too much activity to load completely. Choose a shorter period.');
}
