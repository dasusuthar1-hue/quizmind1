// Groq AI Wrapper for Chat & Quiz Generation
async function callGroqAI(prompt) {
  const key = localStorage.getItem('groq_api_key') || '';
  if(!key) throw new Error('Pehle API Settings mein apni Groq API Key dalein.');

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }]
    })
  });

  let data = {};
  try { data = await response.json(); } catch(e) {}

  if(!response.ok) {
    throw new Error(data?.error?.message || `Groq error (${response.status})`);
  }

  const text = data?.choices?.[0]?.message?.content || '';
  if(!text) throw new Error('Groq AI ne koi uttar nahi diya.');
  return text;
}

// Gemini AI Wrapper for PDF Quiz
async function callGeminiAI(prompt) {
  const key = localStorage.getItem('gemini_api_key') || '';
  if(!key) throw new Error('Pehle API Settings mein apni Gemini API Key dalein.');

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  
  let d = {}; 
  try { d = await r.json(); } catch(e) {}
  
  if(!r.ok) throw new Error(d?.error?.message || `Gemini error (${r.status})`);
  const text = d?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if(!text) throw new Error('Gemini ne koi uttar nahi diya.');
  return text;
}
