const QM_MODELS = ['gemini-3.8-flash', 'gemini-1.5-flash'];
let qmAdminToken = sessionStorage.getItem('quizmind_admin_token') || '';
let qmPrivatePool = [];
let qmQuizMode = 'global';

function qm$(id){ return document.getElementById(id); }
function qmEsc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qmKey(){ return localStorage.getItem('gemini_api_key') || ''; }

function qmFileBase64(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Robust Gemini caller with automatic fallback for high demand errors
async function qmGemini(prompt, parts=[]){
  const key = qmKey(); 
  if(!key) throw new Error('Pehle API Settings mein apni Gemini API Key dalein.');
  
  let lastError = null;
  for(const model of QM_MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...parts] }] })
      });
      
      let d = {}; 
      try { d = await r.json(); } catch(e) {}
      
      if(!r.ok) {
        throw new Error(d?.error?.message || `Gemini error (${r.status})`);
      }
      
      const text = d?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if(!text) throw new Error('Gemini ne koi uttar nahi diya.');
      return text;
    } catch(e) {
      lastError = e;
      // If high demand or overload, loop will try next model
    }
  }
  throw lastError || new Error('Sabhi AI models par high demand hai. Kripya kuch samay baad dobara koshish karein.');
}

function qmCleanJson(t){ return t.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim(); }
function qmParse(t){ try{ return JSON.parse(qmCleanJson(t)); }catch(e){ const a=t.indexOf('{'),b=t.lastIndexOf('}'); if(a>=0&&b>a) return JSON.parse(t.slice(a,b+1)); throw e; } }
function qmNormalize(arr){ 
  return (Array.isArray(arr)?arr:[]).map((q,i)=>({
    id: q.id || `q_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,
    question: String(q.question||'').trim(),
    options: Array.isArray(q.options)?q.options.slice(0,4).map(x=>String(x).trim()):[],
    answer: String(q.answer||'').trim(),
    detail: String(q.detail||q.explanation||'').trim()
  })).filter(q=>q.question && q.options.length===4); 
}
