import {createClient} from '@supabase/supabase-js';
// Separate storage prevents listener sign-in/out from replacing the administrator session.
export const listener=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY,{auth:{storageKey:'dj-buang-listener-session',detectSessionInUrl:false}});
let configPromise;
export function contactConfiguration(){
 if(!configPromise)configPromise=fetch('/api/contact-config',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Private conversations are not available yet.');return r.json();}).catch(e=>{configPromise=null;throw e;});
 return configPromise;
}
export async function listenerRequest(path,options={}){
 const {data:{session}}=await listener.auth.getSession();
 const headers=new Headers(options.headers);if(session?.access_token)headers.set('Authorization','Bearer '+session.access_token);
 const response=await fetch(path,{...options,headers,cache:'no-store'});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.error||'Your private conversations could not be loaded.');return result;
}
export function listenerAction(action,data,turnstileToken){
 if(import.meta.env.DEV&&import.meta.env.VITE_ALLOW_LIVE_WRITES!=='true')throw Error('This development preview does not save production changes.');
 return listenerRequest('/api/conversations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data,turnstileToken})});
}
