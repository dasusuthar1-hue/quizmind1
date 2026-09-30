/* QuizMind v2 - global question bank + private student AI content */
const QM_MODEL = 'gemini-3.8-flash';
let qmAdminToken = sessionStorage.getItem('quizmind_admin_token') || '';
let qmPrivatePool = [];
let qmQuizMode = 'global';

function qm$(id){ return document.getElementById(id); }
function qmEsc(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function qmKey(){ return localStorage.getItem('gemini_api_key') || ''; }

function qmAddStyles(){
  const s=document.createElement('style'); s.textContent=`
    .qm-note{font-size:12px;color:#5f6368;line-height:1.5}.qm-success{color:#137333}.qm-danger{color:#b3261e}
    .qm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.qm-admin-card{border:1px solid #e1e3e6;border-radius:12px;padding:14px;margin-top:12px;background:#f8f9fa}
    .qm-pending{border:1px solid #dadce0;border-radius:10px;padding:12px;margin:8px 0;background:white}.qm-mini{background:#1a73e8;color:#fff;border:0;border-radius:8px;padding:7px 10px;cursor:pointer;margin:3px}
    @media(max-width:700px){.qm-grid{grid-template-columns:1fr}}
  `; document.head.appendChild(s);
}

async function qmGemini(prompt, parts=[]){
  const key=qmKey(); if(!key) throw new Error('पहले API Settings में अपनी Gemini API Key डालें।');
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${QM_MODEL}:generateContent`,{
    method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({contents:[{parts:[{text:prompt},...parts]}]})
  });
  let d={}; try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d?.error?.message || `Gemini error (${r.status})`);
  const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  if(!text) throw new Error('Gemini ने कोई उत्तर नहीं दिया।');
  return text;
}
function qmCleanJson(t){return t.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();}
function qmParse(t){try{return JSON.parse(qmCleanJson(t));}catch(e){const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw e;}}
function qmNormalize(arr){return (Array.isArray(arr)?arr:[]).map((q,i)=>({id:q.id||`q_${Date.now()}_${i}_${Math.random().toString(36).slice(2,7)}`,question:String(q.question||'').trim(),options:Array.isArray(q.options)?q.options.slice(0,4).map(x=>String(x).trim()):[],answer:String(q.answer||'').trim(),detail:String(q.detail||q.explanation||'').trim()})).filter(q=>q.question&&q.options.length===4&&q.options.includes(q.answer));}

function qmFileBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});}

/* API key: browser only */
function saveApiKey(){const k=qm$('api-key-input')?.value.trim();if(!k)return alert('API Key डालें।');localStorage.setItem('gemini_api_key',k);if(qm$('api-status'))qm$('api-status').innerHTML='<span class="qm-success">API Key इसी browser में save हो गई है। Database में नहीं भेजी गई।</span>';alert('API Key browser में save हो गई।');}
function removeApiKey(){localStorage.removeItem('gemini_api_key');if(qm$('api-key-input'))qm$('api-key-input').value='';if(qm$('api-status'))qm$('api-status').innerHTML='<span class="qm-success">API Key हटा दी गई।</span>';}
async function testApiKey(){try{await qmGemini('सिर्फ OK लिखें।');if(qm$('api-status'))qm$('api-status').innerHTML='<span class="qm-success">Gemini API सही काम कर रही है।</span>';}catch(e){if(qm$('api-status'))qm$('api-status').innerHTML='<span class="qm-danger">'+qmEsc(e.message)+'</span>';}}

/* Normal AI answer: only one AI call, no automatic quiz */
async function handleHomeChatSend(mode='answer'){
  const input=qm$('home-chat-input'); const query=input?.value.trim(); if(!query)return;
  const chat=qm$('homeChatDisplay');
  const u=document.createElement('div');u.className='chat-bubble user';u.innerText=query;chat.appendChild(u);input.value='';chat.scrollTop=chat.scrollHeight;
  const loading=document.createElement('div');loading.className='chat-bubble ai';loading.innerText=mode==='quiz'?'AI 20 questions तैयार कर रहा है...':'AI जवाब तैयार कर रहा है...';chat.appendChild(loading);
  try{
    if(mode==='quiz'){
      const raw=await qmGemini(`Topic: "${query}". EXACTLY 20 MCQ बनाइए। केवल JSON दें: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":"exact option text","detail":"short Hindi explanation"}]}. हर answer options में exact होना चाहिए।`);
      qmPrivatePool=qmNormalize(qmParse(raw).questions); if(qmPrivatePool.length<5)throw new Error('AI ने पर्याप्त valid questions नहीं दिए।');
      loading.innerText=`${query} पर ${qmPrivatePool.length} private questions तैयार हैं।`; qmShowPreview(query,qmPrivatePool); return;
    }
    loading.innerText=await qmGemini(`User का सवाल/topic: "${query}". हिंदी में साफ, तथ्यात्मक और उपयोगी उत्तर दें। Quiz generate न करें।`);
  }catch(e){loading.innerText='Error: '+e.message;}
}
function qmShowPreview(topic,pool){
  const p=qm$('quiz-ready-popup');if(!p)return;
  qm$('quiz-ready-desc').innerText=`"${topic}" पर ${pool.length} private questions तैयार हैं। ये Global Question Bank में save नहीं होंगे।`;
  qm$('generated-question-preview-list').innerHTML=pool.map((q,i)=>`<div class="generated-q-item">${i+1}. ${qmEsc(q.question)}</div>`).join('');
  p.classList.remove('hidden');
}
function startGeneratedQuizFromChat(){qm$('quiz-ready-popup')?.classList.add('hidden');qmQuizMode='private';qmStartSet(qmPrivatePool);}

/* Private PDF */
function handlePdfUpload(input){if(input.files?.[0]&&qm$('pdf-status-text'))qm$('pdf-status-text').innerText='File selected: '+input.files[0].name;}
async function processPdfToQuiz(){
  const file=qm$('pdf-file-input')?.files?.[0];if(!file)return alert('पहले PDF/TXT चुनें।');
  const count=Math.min(50,Math.max(5,Number(qm$('pdf-question-count')?.value)||20));
  if(qm$('pdf-status-text'))qm$('pdf-status-text').innerText='Gemini PDF पढ़कर private questions बना रहा है...';
  try{
    const base64=await qmFileBase64(file);
    const raw=await qmGemini(`इस PDF/notes की सामग्री से ${count} MCQ बनाइए। केवल JSON दें: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":"exact option","detail":"Hindi explanation"}]}. केवल document में मौजूद जानकारी पर आधारित रहें।`,[{inlineData:{mimeType:file.type||'application/pdf',data:base64}}]);
    qmPrivatePool=qmNormalize(qmParse(raw).questions);if(!qmPrivatePool.length)throw new Error('PDF से valid questions नहीं मिले।');
    if(qm$('pdf-status-text'))qm$('pdf-status-text').innerHTML=`<span class="qm-success">${qmPrivatePool.length} private questions तैयार हैं।</span>`;
    qmQuizMode='private';qmShowPreview(file.name,qmPrivatePool);
  }catch(e){if(qm$('pdf-status-text'))qm$('pdf-status-text').innerHTML=`<span class="qm-danger">Error: ${qmEsc(e.message)}</span>`;}
}
async function handleImageUpload(input){
  const file=input.files?.[0];if(!file)return;try{const b=await qmFileBase64(file);const text=await qmGemini('इस image को पढ़कर हिंदी में साफ उत्तर दें। अगर इसमें MCQ है तो सही answer और छोटी explanation दें।',[{inlineData:{mimeType:file.type,data:b}}]);const chat=qm$('homeChatDisplay');const a=document.createElement('div');a.className='chat-bubble ai';a.innerText=text;chat.appendChild(a);}catch(e){alert(e.message);}}

/* Global DB */
async function qmGlobal(subject){const r=await fetch(`/api/questions?subject=${encodeURIComponent(subject)}`);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Global question server उपलब्ध नहीं है।');return d.questions||[];}
function qmSubjects(){const out=[];for(const cat of Object.values(categoryData||{}))for(const [k,n] of Object.entries(cat.subjects))out.push([k,n,cat.title]);return out;}
function qmFillSubjects(){['admin-subject-select','submit-subject-select'].forEach(id=>{const s=qm$(id);if(!s)return;s.innerHTML='';for(const [k,n,title] of qmSubjects()){let o=document.createElement('option');o.value=k;o.textContent=n;s.appendChild(o);}});}
async function renderDashboardSections(){
  const c=qm$('sections-container');if(!c)return;c.innerHTML='<div class="api-info-box">Global questions load हो रहे हैं...</div>';
  try{
    const attempted=JSON.parse(localStorage.getItem('quizmind_attempted_global')||'[]');const map={};
    for(const [k] of qmSubjects())map[k]=await qmGlobal(k);
    c.innerHTML='';
    for(const catKey in categoryData){const cat=categoryData[catKey];const sec=document.createElement('div');sec.innerHTML=`<div class="section-header">${cat.title}</div>`;const grid=document.createElement('div');grid.className='subject-grid';
      for(const [k,n] of Object.entries(cat.subjects)){const qs=map[k]||[];const solved=qs.filter(q=>attempted.includes(q.id)).length;const card=document.createElement('div');card.className='sub-card';card.innerHTML=`<div class="sub-card-title"><i class="fa-solid fa-folder" style="color:#fbbc05"></i>${qmEsc(n)}</div><div class="sub-card-info"><span>Total: <b>${qs.length}</b></span><span>Solved: <b>${solved}</b></span></div><button class="card-start-btn" onclick="startGlobalQuiz('${k}')">▶ Start Quiz</button>`;grid.appendChild(card);}sec.appendChild(grid);c.appendChild(sec);}
  }catch(e){c.innerHTML=`<div class="api-info-box"><span class="qm-danger">${qmEsc(e.message)}</span><br>Global Question Bank के लिए server चलना जरूरी है।</div>`;}
}
async function startGlobalQuiz(subject){try{let qs=await qmGlobal(subject);const done=JSON.parse(localStorage.getItem('quizmind_attempted_global')||'[]');let fresh=qs.filter(q=>!done.includes(q.id));if(!fresh.length)fresh=qs;fresh=fresh.sort(()=>Math.random()-.5).slice(0,10);qmQuizMode='global';qmStartSet(fresh);}catch(e){alert(e.message);}}
function qmStartSet(pool){if(!pool?.length)return alert('कोई question नहीं है।');currentQuizQuestions=pool;currentIndex=0;score=0;switchTab('quiz-screen');document.getElementById('ai-host-speech').innerText=`${pool.length} questions की quiz शुरू हो रही है।`;loadQuestion();}

/* Override quiz explanation: use saved detail, no extra Gemini call */
function loadQuestion(){clearInterval(quizTimer);if(currentIndex>=currentQuizQuestions.length){showResult();return;}isAnswerLocked=false;timeLeftSec=15;qm$('time-left').innerText='15';const q=currentQuizQuestions[currentIndex];qm$('q-title').innerText=`प्रश्न ${currentIndex+1} / ${currentQuizQuestions.length}`;qm$('question-container').innerText=q.question;const box=qm$('options-container');box.innerHTML='';qm$('next-btn').classList.add('hidden');q.options.forEach(opt=>{const b=document.createElement('button');b.className='portal-btn';b.style.cssText='margin-bottom:10px;background:#f0f4f9;color:#1a73e8;border:1px solid #d3e3fd';b.innerText=opt;b.onclick=()=>qmSelectOption(opt,q);box.appendChild(b);});startTimer(q.answer,q.detail);}
function startTimer(correct,detail){quizTimer=setInterval(()=>{timeLeftSec--;qm$('time-left').innerText=timeLeftSec;if(timeLeftSec<=0){clearInterval(quizTimer);if(!isAnswerLocked)qmSelectOption('__TIMEOUT__',currentQuizQuestions[currentIndex]);}},1000);}
function qmSelectOption(selected,q){if(isAnswerLocked)return;isAnswerLocked=true;clearInterval(quizTimer);const correct=selected===q.answer;if(correct)score++;if(qmQuizMode==='global'){const a=JSON.parse(localStorage.getItem('quizmind_attempted_global')||'[]');if(!a.includes(q.id))a.push(q.id);localStorage.setItem('quizmind_attempted_global',JSON.stringify(a));}const chosen=selected==='__TIMEOUT__'?'समय समाप्त':selected;qm$('popup-auto-question').innerText=q.question;qm$('popup-ai-detail-content').innerHTML=`आपका उत्तर: <b>${qmEsc(chosen)}</b><br>सही उत्तर: <b>${qmEsc(q.answer)}</b><br><br><b>Explanation:</b><br>${qmEsc(q.detail||'Explanation उपलब्ध नहीं है।')}`;qm$('ai-popup-modal').classList.remove('hidden');}
function closeAiPopupAndNext(){qm$('ai-popup-modal')?.classList.add('hidden');currentIndex++;loadQuestion();}
function triggerNextWithKahavat(){currentIndex++;loadQuestion();}
function showResult(){clearInterval(quizTimer);qm$('score-card').innerText=`आपका Score: ${score} / ${currentQuizQuestions.length}`;switchTab('result-screen');}

/* Admin auth - password server side */
async function checkAdminAccess(){if(qmAdminToken)return switchTab('admin-section');qm$('admin-modal').classList.remove('hidden');}
async function verifyAdminPass(){const p=qm$('admin-pass-input')?.value.trim();if(!p)return;try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Login failed');qmAdminToken=d.token;sessionStorage.setItem('quizmind_admin_token',qmAdminToken);qm$('admin-pass-input').value='';qm$('admin-modal').classList.add('hidden');switchTab('admin-section');}catch(e){alert(e.message);}}
function qmAuthHeaders(){return {'Content-Type':'application/json','Authorization':'Bearer '+qmAdminToken};}
function qmParseBulk(raw){
  raw=raw.trim();if(!raw)return[];try{const x=JSON.parse(raw);return qmNormalize(Array.isArray(x)?x:(x.questions||[]));}catch{}
  return raw.split(/\n\s*\n/).map(block=>{const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);const q=lines.find(x=>/^question\s*:/i.test(x))?.replace(/^question\s*:/i,'').trim()||lines[0]||'';const opts=lines.filter(x=>/^[A-D][.)]:?\s*/i.test(x)).map(x=>x.replace(/^[A-D][.)]:?\s*/i,'').trim()).slice(0,4);const ans=lines.find(x=>/^answer\s*:/i.test(x))?.replace(/^answer\s*:/i,'').trim()||'';const detail=lines.find(x=>/^(detail|explanation)\s*:/i.test(x))?.replace(/^(detail|explanation)\s*:/i,'').trim()||'';return {question:q,options:opts,answer:ans,detail};}).filter(q=>q.question);
}
async function addBulkQuestions(){if(!qmAdminToken)return checkAdminAccess();const qs=qmParseBulk(qm$('bulk-question-input')?.value||'');if(!qs.length)return alert('Valid questions नहीं मिले।');try{const subject=qm$('admin-subject-select').value;const r=await fetch('/api/questions/bulk',{method:'POST',headers:qmAuthHeaders(),body:JSON.stringify({subject,questions:qs})});const d=await r.json();if(!r.ok)throw new Error(d.error);qm$('bulk-question-input').value='';qm$('admin-status').innerHTML=`<span class="qm-success">Added: ${d.added} | Duplicate: ${d.skipped} | Invalid: ${d.invalid}</span>`;renderDashboardSections();}catch(e){alert(e.message);}}
async function addQuestionViaAI(){if(!qmAdminToken)return checkAdminAccess();const raw=qm$('admin-question-input')?.value.trim();if(!raw)return alert('Question लिखें।');try{qm$('admin-status').innerText='AI question बना रहा है...';const t=await qmGemini(`इस सवाल को अच्छे 4-option MCQ में बदलें। केवल JSON दें: {"question":"...","options":["...","...","...","..."],"answer":"exact option","detail":"Hindi explanation"}. सवाल: ${raw}`);const q=qmNormalize([qmParse(t)])[0];if(!q)throw new Error('AI ने valid MCQ नहीं बनाया।');const r=await fetch('/api/questions/bulk',{method:'POST',headers:qmAuthHeaders(),body:JSON.stringify({subject:qm$('admin-subject-select').value,questions:[q]})});const d=await r.json();if(!r.ok)throw new Error(d.error);qm$('admin-question-input').value='';qm$('admin-status').innerHTML=`<span class="qm-success">Global DB में question add हो गया। Added: ${d.added}</span>`;renderDashboardSections();}catch(e){qm$('admin-status').innerHTML=`<span class="qm-danger">${qmEsc(e.message)}</span>`;}}
async function generateGlobalQuestionsWithAI(){if(!qmAdminToken)return checkAdminAccess();const count=Math.min(100,Math.max(1,Number(qm$('ai-bulk-count')?.value)||20));try{qm$('admin-status').innerText=`AI ${count} questions बना रहा है...`;const subject=qm$('admin-subject-select').value;const raw=await qmGemini(`Subject: ${subject}. ${count} अच्छे MCQ बनाइए। केवल JSON दें: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":"exact option","detail":"Hindi explanation"}]}.`);const qs=qmNormalize(qmParse(raw).questions);const r=await fetch('/api/questions/bulk',{method:'POST',headers:qmAuthHeaders(),body:JSON.stringify({subject,questions:qs})});const d=await r.json();if(!r.ok)throw new Error(d.error);qm$('admin-status').innerHTML=`<span class="qm-success">AI Generated: ${qs.length} | Added: ${d.added} | Duplicate: ${d.skipped}</span>`;renderDashboardSections();}catch(e){qm$('admin-status').innerHTML=`<span class="qm-danger">${qmEsc(e.message)}</span>`;}}
async function loadPendingQuestions(){if(!qmAdminToken)return checkAdminAccess();try{const r=await fetch('/api/questions/pending',{headers:{Authorization:'Bearer '+qmAdminToken}});const d=await r.json();if(!r.ok)throw new Error(d.error);const box=qm$('pending-questions-box');box.innerHTML=d.pending.length?d.pending.map(q=>`<div class="qm-pending"><b>${qmEsc(q.question)}</b><br><small>${qmEsc(q.subject)} | ${qmEsc(q.options.join(' | '))}</small><br><button class="qm-mini" onclick="approvePending('${q.id}')">Approve</button><button class="qm-mini" style="background:#b3261e" onclick="rejectPending('${q.id}')">Reject</button></div>`).join(''):'<div class="qm-note">कोई pending question नहीं है।';}catch(e){alert(e.message);}}
async function approvePending(id){const r=await fetch('/api/questions/approve',{method:'POST',headers:qmAuthHeaders(),body:JSON.stringify({id})});const d=await r.json();if(!r.ok)return alert(d.error);loadPendingQuestions();renderDashboardSections();}
async function rejectPending(id){const r=await fetch('/api/questions/reject',{method:'POST',headers:qmAuthHeaders(),body:JSON.stringify({id})});const d=await r.json();if(!r.ok)return alert(d.error);loadPendingQuestions();}
async function submitStudentQuestion(){const q={question:qm$('submit-question')?.value.trim(),options:[qm$('submit-opt-a')?.value.trim(),qm$('submit-opt-b')?.value.trim(),qm$('submit-opt-c')?.value.trim(),qm$('submit-opt-d')?.value.trim()],answer:qm$('submit-answer')?.value.trim(),detail:qm$('submit-detail')?.value.trim()};if(!q.question||q.options.some(x=>!x)||!q.answer)return alert('Question, चारों options और सही answer भरें।');try{const r=await fetch('/api/questions/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:qm$('submit-subject-select').value,question:q})});const d=await r.json();if(!r.ok)throw new Error(d.error);alert(d.message);['submit-question','submit-opt-a','submit-opt-b','submit-opt-c','submit-opt-d','submit-answer','submit-detail'].forEach(id=>{if(qm$(id))qm$(id).value='';});}catch(e){alert(e.message);}}

/* Build small missing UI pieces without breaking original design */
function qmBuildUI(){
  qmAddStyles();
  const sidebar=qm$('appSidebar');const pdfNav=qm$('nav-pdf-section');
  if(pdfNav&&!qm$('nav-submit-section')){const n=document.createElement('div');n.className='nav-item';n.id='nav-submit-section';n.onclick=()=>switchTab('submit-section');n.innerHTML='<i class="fa-solid fa-paper-plane"></i><span class="nav-text">Question Submit</span>';pdfNav.after(n);}
  const main=qm$('mainWorkspaceArea');
  if(main&&!qm$('submit-section')){const d=document.createElement('div');d.id='submit-section';d.className='content-card';d.innerHTML=`<h2>📤 Question Submit Karein</h2><div class="api-info-box">Student ka question pehle <b>Pending</b> rahega. Admin approve karega tabhi sabhi students ke Global Question Bank me jayega.</div><select id="submit-subject-select" class="form-control"></select><textarea id="submit-question" class="form-control" rows="3" placeholder="Question"></textarea><input id="submit-opt-a" class="form-control" placeholder="Option A"><input id="submit-opt-b" class="form-control" placeholder="Option B"><input id="submit-opt-c" class="form-control" placeholder="Option C"><input id="submit-opt-d" class="form-control" placeholder="Option D"><input id="submit-answer" class="form-control" placeholder="Sahi answer exactly option ki tarah likhein"><textarea id="submit-detail" class="form-control" rows="2" placeholder="Explanation"></textarea><button class="portal-btn" onclick="submitStudentQuestion()">📨 Admin ko bhejein</button>`;const api=qm$('api-section');main.insertBefore(d,api);}
  qmFillSubjects();
  const apiInfo=qm$('api-section');if(apiInfo&&!apiInfo.querySelector('.qm-note')){const n=document.createElement('div');n.className='api-info-box qm-note';n.innerHTML='<b>Privacy:</b> आपकी API Key QuizMind database में save नहीं होती। यह केवल इसी browser के localStorage में रहती है। Browser data clear होने पर हट जाएगी।';apiInfo.insertBefore(n,apiInfo.children[1]||null);}
  const pdf=qm$('pdf-section');if(pdf&&!qm$('pdf-question-count')){const inp=document.createElement('input');inp.id='pdf-question-count';inp.type='number';inp.min='5';inp.max='50';inp.value='20';inp.className='form-control';inp.placeholder='Questions count';const note=document.createElement('div');note.className='api-info-box';note.innerHTML='<b>Private Quiz:</b> PDF से बने questions Global Question Bank में save नहीं होंगे।';const btn=pdf.querySelector('button[onclick="processPdfToQuiz()"]');if(btn){btn.before(inp,note);btn.innerText='🚀 PDF से Private Quiz बनाएं';}}
  const admin=qm$('admin-section');if(admin&&!qm$('bulk-question-input')){const ta=document.createElement('textarea');ta.id='bulk-question-input';ta.className='form-control';ta.rows=10;ta.placeholder='JSON या blank-line separated questions paste करें...';const b=document.createElement('button');b.className='portal-btn';b.innerText='📥 Bulk Questions Global DB में Add करें';b.onclick=addBulkQuestions;const row=document.createElement('div');row.className='qm-admin-card';row.innerHTML='<b>Bulk Question Generator</b><p class="qm-note">यहाँ 1 या 100+ questions paste करके Global Question Bank में जोड़ें।</p>';row.append(ta,b);admin.appendChild(row);
    const tools=document.createElement('div');tools.className='qm-admin-card';tools.innerHTML='<b>AI Bulk Generator</b><div class="qm-grid"><input id="ai-bulk-count" class="form-control" type="number" min="1" max="100" value="20"><button class="portal-btn">🤖 AI से Global Questions बनाएं</button></div><div id="admin-status" class="api-info-box">Ready</div><div id="pending-questions-box"></div>';tools.querySelector('button').onclick=generateGlobalQuestionsWithAI;admin.appendChild(tools);
    const pb=document.createElement('button');pb.className='portal-btn';pb.style.marginTop='10px';pb.innerText='📋 Pending Student Questions';pb.onclick=loadPendingQuestions;admin.appendChild(pb);
  }
}

const _oldSwitchTab=window.switchTab;
window.switchTab=function(tabId){if(typeof _oldSwitchTab==='function')_oldSwitchTab(tabId);else{document.querySelectorAll('.content-card,.hero-container').forEach(e=>e.classList.remove('active'));document.getElementById(tabId)?.classList.add('active');}if(tabId==='dashboard-section')renderDashboardSections();if(tabId==='admin-section')qmFillSubjects();};

window.addEventListener('DOMContentLoaded',()=>{qmBuildUI();if(qmKey()&&qm$('api-status'))qm$('api-status').innerHTML='<span class="qm-success">इस browser में API Key saved है।</span>';});
