import { submitContact } from './data';
export function openContact(kind,modal){
 const request=kind==='request';
 modal(`<div class="eyebrow">${request?'YOUR STORY. YOUR SOUND.':'LET’S TALK'}</div><h2>${request?'Request a song':'Send a message'}</h2><p>${request?'Tell me who or what the song is for, the mood, and any details that make it yours.':'Questions, collaborations, or something on your mind? Write to DJ-Buang.'}</p><form id="contact-form"><label class="field">Your name or nickname<input name="name" autocomplete="nickname" required maxlength="200"></label><label class="field">Email for a reply (optional)<input name="email" type="email" autocomplete="email" maxlength="254"></label>${request?'<label class="field">Working title or occasion<input name="title" required maxlength="300" placeholder="A birthday, a memory, your idea…"></label>':''}<label class="field">${request?'Tell me your idea':'Your message'}<textarea name="message" required maxlength="10000"></textarea></label>${request?'<label class="field"><input type="checkbox" name="private" checked>Keep the finished song private</label><p>Your contact details and request notes stay in the administrator inbox. This choice tells DJ-Buang whether the finished song may be shared publicly.</p>':'<p>Your message goes privately to DJ-Buang.</p>'}<div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><p role="alert" id="contact-error"></p>${import.meta.env.DEV?'<p class="studio-note">Development preview · Sending is disabled.</p>':''}<button class="primary" type="submit">Send ${request?'request':'message'} →</button></form>`);
 document.querySelector('#contact-form').onsubmit=async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');if(form.elements.website.value)return;button.disabled=true;
   try{
     const data={name:form.elements.name.value,email:form.elements.email.value,message:form.elements.message.value,title:request?form.elements.title.value:'',private:request&&form.elements.private.checked};
     if(!data.name.trim()||!data.message.trim()||(request&&!data.title.trim()))throw new Error('Please fill in the required fields.');
     await submitContact(kind,data);
     modal(`<div class="eyebrow">${request?'REQUEST RECEIVED':'MESSAGE RECEIVED'}</div><h2>Thanks for reaching out.</h2><p>${request?'Your idea is in the DJ-Buang request inbox. Sending a request does not guarantee a release date.':'Your message has been sent privately to DJ-Buang.'}${data.email?' You included an email address for a reply.':''}</p>`);
   }catch(error){if(document.querySelector('#contact-error'))document.querySelector('#contact-error').textContent=error.message;button.disabled=false;}
 };
}
