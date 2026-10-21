const callback = new URLSearchParams(location.hash.slice(1)).get('type');
if (location.pathname === '/studio/classic' || ['invite', 'recovery'].includes(callback)) {
  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_LIVE_WRITES !== 'true') {
    document.body.innerHTML='<main style="padding:40px"><h1 style="font-size:48px">Classic tools</h1><p>Classic administration and account setup are available on the deployed site. They are disabled in this development preview to prevent production changes.</p><a href="/">Back to the preview →</a></main>';
  } else {
  let classicAllowed=true;
  if(location.pathname==='/studio/classic'&&!['invite','recovery'].includes(callback)){
    try{const {verifyAdmin}=await import('./adminAuth');await verifyAdmin();}
    catch{classicAllowed=false;location.replace('/studio');}
  }
  if(classicAllowed){
  document.querySelector('#site2-style')?.remove();
  document.body.innerHTML = '<div id="root"></div>';
  import('./legacy-main.jsx');
  }
  }
} else {
  import('./site2/main.js');
}
