export async function studioRows(kind,options={}) {
 const rows=[];
 for(let offset=0;offset<=50000;offset+=1000){
  const query=new URLSearchParams({kind,offset:String(offset),...options});const response=await apiFetch('/api/studio-data?'+query);
  if(!response.ok)throw Error('Studio data could not be loaded. Please sign in again.');
  const page=await response.json();rows.push(...page);if(page.length<1000)return rows;
 }
 throw Error('Too much data to load. Choose a shorter period.');
}
export async function studioAudience(options={}) {
 const query=new URLSearchParams({kind:'audience',...options});
 const response=await apiFetch('/api/studio-data?'+query);
 if(!response.ok)throw Error('Audience estimates could not be loaded. Please sign in again.');
 return response.json();
}
import { apiFetch, verifyAdmin } from '../adminAuth';
export function requireWrites() {
  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_LIVE_WRITES !== 'true') throw new Error('This development preview does not save changes. Changes will be enabled on the deployed site.');
}
export async function catalog() {
  const response = await apiFetch('/api/songs');
  if (!response.ok) throw new Error('The music library could not be loaded. Please try again.');
  return response.json();
}
export async function saveSong(song) {
  requireWrites(); await verifyAdmin();
  const response = await apiFetch('/api/songs', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(song) });
  if(!response.ok) throw new Error((await response.json()).error || 'The song could not be saved.');
}
export async function deleteSong(id) {
  requireWrites(); await verifyAdmin();
  const response = await apiFetch('/api/songs?id=' + encodeURIComponent(id), { method: 'DELETE' });
  if (!response.ok) throw new Error((await response.json()).error || 'The song could not be deleted.');
}
export async function uploadFile(file) {
  requireWrites(); await verifyAdmin();
  const body=new FormData(); body.set('file',file);
  const response=await apiFetch('/api/upload',{method:'POST',body});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed.');return result.fileUrl;
}
export async function inbox() {
  await verifyAdmin();
  const [requests,messages,analytics]=await Promise.all([studioRows('requests'),studioRows('messages'),studioRows('totals')]);
  return {requests,messages,analytics};
}
export async function updateInbox(table,id,patch) {
  requireWrites(); await verifyAdmin();
  const response=await apiFetch('/api/studio-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:table==='song_requests'?'requests':'messages',id,patch})});
  if(!response.ok)throw Error('The change could not be saved. Please reload and try again.');
}
export async function interaction(songId,eventType) {
  if(import.meta.env.DEV)return null;
  const response=await apiFetch('/api/interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({songId,eventType})});
  if(!response.ok)throw new Error('This action could not be recorded.');
  return response.json();
}
