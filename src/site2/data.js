import { supabase } from '../supabase';
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
  const results=await Promise.all([
    supabase.from('song_requests').select('id,created_at,requester_name,song_name,details,email,delivery,status,linked_song_id').order('created_at',{ascending:false}),
    supabase.from('private_messages').select('id,created_at,sender_name,sender_email,message,status').order('created_at',{ascending:false}),
    supabase.from('song_analytics').select('*'),
  ]);
  if(results.some(r=>r.error))throw new Error('The studio data could not be loaded. Please sign in again.');
  return {requests:results[0].data,messages:results[1].data,analytics:results[2].data};
}
export async function updateInbox(table,id,patch) {
  requireWrites(); await verifyAdmin();
  const {data,error}=await supabase.from(table).update(patch).eq('id',id).select('id');
  if(error||data?.length!==1)throw new Error('The change could not be saved. Please reload and try again.');
}
export async function interaction(songId,eventType) {
  if(import.meta.env.DEV)return null;
  const response=await apiFetch('/api/interactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({songId,eventType})});
  if(!response.ok)throw new Error('This action could not be recorded.');
  return response.json();
}
