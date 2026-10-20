function common(form){
 const name=String(form.name||'').trim(),email=String(form.email||'').trim(),message=String(form.message||'').trim();
 if(!name||name.length>200||!message||message.length>10000)throw new Error('Please enter your name and message within the allowed lengths.');
 if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Please enter a valid email address or leave it empty.');
 return {name,email,message};
}
export function requestPayload(form){
 const {name,email,message}=common(form),title=String(form.title||'').trim();
 if(!title||title.length>300)throw new Error('Please enter a working title or occasion (up to 300 characters).');
 return {requester_name:name,song_name:title,details:message,email,notify:false,delivery:form.private===false?'public':'private',linked_song_id:'',status:'pending'};
}
export function messagePayload(form){
 const {name,email,message}=common(form);return {sender_name:name,sender_email:email,message,status:'new'};
}
