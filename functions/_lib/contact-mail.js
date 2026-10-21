async function jobs(env,p_action,p_id=null){
 const url=(env.SUPABASE_URL||env.VITE_SUPABASE_URL).replace(/\/$/,'');
 const response=await fetch(url+'/rest/v1/rpc/contact_notification_jobs',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_action,p_id}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Notification queue unavailable');return response.json();
}
export async function deliverContactNotifications(env){
 if((!env.EMAIL?.send&&!env.RESEND_API_KEY)||!env.CONTACT_EMAIL_FROM)return {enabled:false,sent:0};
 const pending=await jobs(env,'claim');let sent=0;
 for(const job of pending){
   try{
     const message={from:env.CONTACT_EMAIL_FROM,to:job.recipient,subject:'DJ-Buang replied to your private conversation',text:'There is a new reply from DJ-Buang in your private inbox.\n\nSign in to read it: https://dj-buang.com/?inbox=1\n\nFor your privacy, message contents are not included in this email.'};
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
