async function jobs(env,p_action,p_id=null){
 const url=(env.SUPABASE_URL||env.VITE_SUPABASE_URL).replace(/\/$/,'');
 const response=await fetch(url+'/rest/v1/rpc/contact_notification_jobs',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_action,p_id}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Notification queue unavailable');return response.json();
}
export async function deliverContactNotifications(env){
 if((!env.EMAIL?.send&&!env.RESEND_API_KEY)||!env.CONTACT_EMAIL_FROM)return {enabled:false,sent:0};
 let inboxUrl='https://dj-buang.com/?inbox=1';
 if(env.CONTACT_TEST_MODE==='true'){const url=new URL(env.CONTACT_TEST_INBOX_URL||'');if(url.protocol!=='https:'||!url.hostname.endsWith('.dj-buang-song-site.pages.dev')||url.pathname!=='/'||url.search!=='?inbox=1')throw Error('Restricted test inbox is not configured');inboxUrl=url.href;}
 const pending=await jobs(env,'claim');let sent=0;
 for(const job of pending){
   try{
     if(env.CONTACT_TEST_MODE==='true'&&!(env.CONTACT_TEST_EMAILS||'').split(',').map(value=>value.trim().toLowerCase()).includes(job.recipient.toLowerCase()))throw Error('Recipient is outside the restricted test');
     const message={from:env.CONTACT_EMAIL_FROM,to:job.recipient,subject:'DJ-Buang replied to your private conversation',text:'There is a new reply from DJ-Buang in your private inbox.\n\nSign in to read it: '+inboxUrl+'\n\nFor your privacy, message contents are not included in this email.'};
     if(env.EMAIL?.send)await env.EMAIL.send(message);
     else{
       const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'contact-notification-'+job.id},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});
       if(!response.ok)throw Error('Email delivery failed');
     }
     await jobs(env,'sent',job.id);sent++;
   }catch{await jobs(env,'failed',job.id);}
 }
 return {enabled:true,sent};
}
