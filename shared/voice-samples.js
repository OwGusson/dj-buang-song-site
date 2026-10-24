export const VOICE_MAX_BYTES=10*1024*1024;
export const VOICE_BUCKET='dj-buang-voices';
export function voiceConsent(data){
 for(const key of ['own_adult_voice','request_use','retention_30','future_use','keep_90_days'])if(typeof data[key]!=='boolean')throw Error('Please check the voice permission choices.');
 if(!data.own_adult_voice||!data.request_use||!data.retention_30)throw Error('Confirm your own adult voice, requested-song use, and storage period before uploading.');
 if(data.keep_90_days&&!data.future_use)throw Error('90-day storage requires separate future-character permission.');
 return Object.fromEntries(['own_adult_voice','request_use','retention_30','future_use','keep_90_days'].map(k=>[k,data[k]]));
}
export async function validateVoiceFile(file){
 if(!file||typeof file==='string'||!file.size||file.size>VOICE_MAX_BYTES)throw Error('Choose one audio file up to 10 MB.');
 const ext=file.name.split('.').pop().toLowerCase(),bytes=new Uint8Array(await file.slice(0,16).arrayBuffer()),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,a+b));
 if(ext==='wav'&&['audio/wav','audio/x-wav',''].includes(file.type)&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE')return 'audio/wav';
 if(ext==='mp3'&&['audio/mpeg','audio/mp3',''].includes(file.type)&&(ascii(0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))return 'audio/mpeg';
 if(ext==='m4a'&&['audio/mp4','audio/x-m4a',''].includes(file.type)&&ascii(4,4)==='ftyp')return 'audio/mp4';
 throw Error('Use a WAV, MP3, or M4A file with matching audio content.');
}
