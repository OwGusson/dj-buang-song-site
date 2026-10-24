// Own authentication: a random maintenance token held in Supabase Vault, never the browser.
Deno.serve(async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 if(req.method!=='POST')return new Response('{}',{status:405,headers});
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||!/^[0-9a-f]{64}$/.test(token))return new Response('{}',{status:401,headers});
 const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 async function jobs(action:string,id:string|null=null){return fetch(base+'/rest/v1/rpc/voice_retention_jobs',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_action:action,p_id:id}),signal:AbortSignal.timeout(10000)});}
 const claim=await jobs('claim');if(!claim.ok)return new Response('{}',{status:claim.status===401||claim.status===403?401:503,headers});
 const rows=await claim.json();let deleted=0,failed=0;
 await Promise.all(rows.map(async(row:{id:string;object_key:string})=>{try{
   if(!/^samples\/[0-9a-f-]{36}\.(wav|mp3|m4a)$/.test(row.object_key))throw Error('Invalid private key');
   const removed=await fetch(base+'/storage/v1/object/dj-buang-voices',{method:'DELETE',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[row.object_key]}),signal:AbortSignal.timeout(20000)});
   if(!removed.ok)throw Error('Storage deletion failed');const done=await jobs('deleted',row.id);if(!done.ok)throw Error('Acknowledgement failed');deleted++;
  }catch{failed++;}}));
 return new Response(JSON.stringify({deleted,failed}),{status:failed?503:200,headers});
});
