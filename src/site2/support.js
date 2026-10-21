const sdkUrl='https://www.paypal.com/sdk/js?client-id=BAA_OREgWSyJOiutyS66TEQGb1J1SXubOfNmpUXOhuFV3Y6wMV1mGbmyMpkMnTuT8-NgUwnI5UiJYwsB5A&components=hosted-buttons&disable-funding=venmo&currency=EUR';
let sdkPromise;
let view=0;

export function loadPayPal(){
 if(window.paypal?.HostedButtons)return Promise.resolve(window.paypal);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.id='dj-buang-paypal-sdk';script.src=sdkUrl;script.async=true;
   const fail=()=>{clearTimeout(timer);script.remove();sdkPromise=undefined;reject(new Error('PayPal could not load. Please try again or check your connection.'));};
   const timer=setTimeout(fail,20000);
   script.onload=()=>{clearTimeout(timer);if(window.paypal?.HostedButtons)resolve(window.paypal);else fail();};
   script.onerror=fail;document.head.append(script);
 });
 return sdkPromise;
}

export async function openSupport(modal){
 if(!import.meta.env.DEV){
   let enabled=false;
   try{const response=await fetch('/api/contact-config',{cache:'no-store'});if(response.ok)enabled=(await response.json()).supportEnabled===true;}catch{/* Keep checkout unavailable when its release setting cannot be read. */}
   if(!enabled){modal('<div class="eyebrow">KEEP THE MUSIC GOING</div><h2>Thank you for the support.</h2><p>Financial support will open soon. For now, every listen and share helps the music reach someone new.</p><a class="outline" href="#music" id="support-listen">Explore the music ↗</a>');document.querySelector('#support-listen').onclick=()=>document.querySelector('#modal').close();return;}
 }
 const id=`paypal-container-TRZGT92KG72RL-${++view}`;
 modal(`<div class="eyebrow">KEEP THE MUSIC GOING</div><h2>Support DJ-Buang</h2><p>Optional support for the music. No product, custom song, or other benefit is included. Listening and sharing are always appreciated too.</p>${import.meta.env.DEV?'<p class="studio-note">Preview: this button uses real EUR payments. Seller details on receipts have not yet been verified.</p>':''}<p class="support-privacy">Support is not posted publicly on this website. PayPal processes your payment and may share your name and email with DJ-Buang.</p><p id="support-status" role="status">Loading secure PayPal checkout…</p><div id="${id}" class="support-checkout"></div><button class="outline" id="support-retry" hidden>Try loading PayPal again</button>`);
 const container=document.getElementById(id),status=document.getElementById('support-status'),retry=document.getElementById('support-retry');
 retry.onclick=()=>openSupport(modal);
 try{
   const paypal=await loadPayPal();
   if(!container.isConnected||!document.querySelector('#modal').open)return;
   await paypal.HostedButtons({hostedButtonId:'TRZGT92KG72RL'}).render('#'+id);
   if(container.isConnected)status.hidden=true;
 }catch{
   if(!container.isConnected)return;
   status.textContent='PayPal checkout could not load. Please try again. Your payment has not been started.';
   retry.hidden=false;
 }
}
