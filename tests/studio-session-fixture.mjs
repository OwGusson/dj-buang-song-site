export function studioLease(path,user='admin') {return path.startsWith('data/studio-sessions/')?{text:async()=>JSON.stringify({user,started:Date.now(),active:Date.now()})}:null;}
