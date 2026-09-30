const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data', 'questions.json');
const sessions = new Map();

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({questions:[],pending:[]}, null, 2));

const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};

function readDb(){try{const d=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));return {questions:Array.isArray(d.questions)?d.questions:[],pending:Array.isArray(d.pending)?d.pending:[]};}catch{return {questions:[],pending:[]};}}
function writeDb(d){fs.writeFileSync(DB_FILE,JSON.stringify(d,null,2));}
function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(body);}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2*1024*1024)req.destroy();});req.on('end',()=>{try{resolve(b?JSON.parse(b):{});}catch(e){reject(e);}});req.on('error',reject);});}
function admin(req){const h=req.headers.authorization||'';const token=h.replace(/^Bearer\s+/i,'');return token&&sessions.has(token);}
function normalize(q,subject){if(!q||typeof q.question!=='string')return null;const options=Array.isArray(q.options)?q.options.map(String).slice(0,4):[];const answer=String(q.answer??'').trim();if(options.length!==4||!answer||!options.includes(answer))return null;return {id:String(q.id||crypto.randomUUID()),subject:String(subject||q.subject||'').trim(),question:q.question.trim(),options,answer,detail:String(q.detail||q.explanation||'').trim(),source:String(q.source||'global'),createdAt:new Date().toISOString()};}

async function api(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true});
  if(req.method==='POST'&&url.pathname==='/api/admin/login'){
    let b;try{b=await body(req);}catch{return json(res,400,{error:'Invalid JSON'});}
    if(String(b.password||'')!==ADMIN_PASSWORD)return json(res,401,{error:'गलत Admin Password.'});
    const token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now());return json(res,200,{token});
  }
  if(req.method==='GET'&&url.pathname==='/api/questions'){
    const subject=url.searchParams.get('subject')||'';const d=readDb();return json(res,200,{questions:subject?d.questions.filter(q=>q.subject===subject):d.questions});
  }
  if(req.method==='POST'&&url.pathname==='/api/questions/submit'){
    let b;try{b=await body(req);}catch{return json(res,400,{error:'Invalid JSON'});}
    const q=normalize(b.question,b.subject);if(!q)return json(res,400,{error:'Question format गलत है।'});q.source='student-pending';const d=readDb();d.pending.push(q);writeDb(d);return json(res,200,{ok:true,message:'Question Admin approval के लिए भेज दिया गया है।'});
  }
  if(req.method==='GET'&&url.pathname==='/api/questions/pending'){
    if(!admin(req))return json(res,401,{error:'Admin authorization required.'});return json(res,200,{pending:readDb().pending});
  }
  if(req.method==='POST'&&url.pathname==='/api/questions/bulk'){
    if(!admin(req))return json(res,401,{error:'Admin authorization required.'});let b;try{b=await body(req);}catch{return json(res,400,{error:'Invalid JSON'});}
    const subject=String(b.subject||'').trim(), incoming=Array.isArray(b.questions)?b.questions:[];if(!subject||!incoming.length)return json(res,400,{error:'Subject और questions जरूरी हैं।'});
    const d=readDb(),existing=new Set(d.questions.map(q=>`${q.subject}|${q.question.toLowerCase().trim()}`));let added=0,skipped=0,invalid=0;
    for(const raw of incoming){const q=normalize(raw,subject);if(!q){invalid++;continue;}const key=`${subject}|${q.question.toLowerCase()}`;if(existing.has(key)){skipped++;continue;}d.questions.push(q);existing.add(key);added++;}writeDb(d);return json(res,200,{added,skipped,invalid,total:d.questions.length});
  }
  if(req.method==='POST'&&(url.pathname==='/api/questions/approve'||url.pathname==='/api/questions/reject')){
    if(!admin(req))return json(res,401,{error:'Admin authorization required.'});let b;try{b=await body(req);}catch{return json(res,400,{error:'Invalid JSON'});}
    const d=readDb(),id=String(b.id||''),idx=d.pending.findIndex(q=>q.id===id);if(idx<0)return json(res,404,{error:'Pending question नहीं मिला।'});const q=d.pending.splice(idx,1)[0];
    if(url.pathname.endsWith('/approve')){const dup=d.questions.some(x=>x.subject===q.subject&&x.question.toLowerCase()===q.question.toLowerCase());if(!dup){q.source='student-approved';d.questions.push(q);}writeDb(d);return json(res,200,{ok:true,duplicate:dup});}
    writeDb(d);return json(res,200,{ok:true,removed:1});
  }
  return json(res,404,{error:'API route नहीं मिला।'});
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(url.pathname.startsWith('/api/')){try{return await api(req,res,url);}catch(e){return json(res,500,{error:e.message||'Server error'});}}
  let filePath=path.join(ROOT,url.pathname==='/'?'index.html':url.pathname.replace(/^\/+/,''));
  if(!filePath.startsWith(ROOT))return res.writeHead(403).end('Forbidden');
  fs.stat(filePath,(err,st)=>{if(err||!st.isFile())return res.writeHead(404).end('Not Found');const ext=path.extname(filePath).toLowerCase();res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'});fs.createReadStream(filePath).pipe(res);});
});
server.listen(PORT,()=>console.log(`QuizMind running at http://localhost:${PORT}`));
