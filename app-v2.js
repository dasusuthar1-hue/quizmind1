const QM_MODEL = 'gemini-3.8-flash';
let qmAdminToken = sessionStorage.getItem('quizmind_admin_token') || '';
let qmPrivatePool = [];
let qmQuizMode = 'global';

function qm$(id){ return document.getElementById(id); }
function qmEsc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qmKey(){ return localStorage.getItem('gemini_api_key') || ''; }

async function qmGemini(prompt, parts=[]){
  const key=qmKey(); if(!key) throw new Error('Pehle API Settings mein apni Gemini API Key dalein.');
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${QM_MODEL}:generateContent`,{
    method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({contents:[{parts:[{text:prompt},...parts]}]})
  });
  let d={}; try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d?.error?.message || `Gemini error (${r.status})`);
  const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  if(!text) throw new Error('Gemini ne koi uttar nahi diya.');
  return text;
}
