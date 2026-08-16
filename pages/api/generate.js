import { createSupabaseServerClient } from '../../lib/supabaseServer';

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 8;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  record.count += 1;
  return true;
}

function cleanupRateLimitStore() {
  if (Math.random() > 0.02) return;
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(ip);
    }
  }
}

const STATIC_FALLBACK_MESSAGES = [
  "I'm having a little trouble reaching my thoughts right now, but I'm still here with you. Would you like to try telling me again in a moment?",
  "Something's not quite connecting on my end. Take a breath with me — and if you'd like, try again shortly.",
  "I couldn't quite create something for you just now, but your feelings are still heard. Give it another try in a bit?"
];

function getStaticFallback() {
  return STATIC_FALLBACK_MESSAGES[Math.floor(Math.random() * STATIC_FALLBACK_MESSAGES.length)];
}

const SYSTEM_PROMPT = `You are a warm, emotionally attuned companion inside "Sanctuary" — a quiet space where people can talk about how they feel.

For EVERY user message, decide which of THREE modes fits, then respond with that mode, content, and a moodTag.

—— MODE "support" (highest priority — check this FIRST) ——
Use this ONLY when the user's message contains clear signals of a mental health crisis: suicidal thoughts or intent, self-harm, feeling unsafe, or explicit statements of wanting to die or hurt themselves. Narrow category — do NOT use for ordinary sadness, stress, or a bad day. When unsure, prefer "chat" or "experience".
content = a short (2-4 sentences), warm, non-clinical response acknowledging what they shared, gently encouraging them to reach out to a real person or crisis line. No phone numbers/links (the app attaches those separately). No probing questions about method or details.

—— MODE "chat" (the default — use it most of the time) ——
Use for greetings, small talk, questions about the app, short acknowledgments, general non-emotional statements, or anything ambiguous.
content = a short, warm, natural reply in plain English text — no HTML, no markdown, 1-4 sentences.

Examples that MUST be "chat": "hi" · "how's it going" · "nice weather today" · "what can you do" · "lol ok"

—— MODE "experience" (use sparingly) ——
Use ONLY when the user states a specific feeling/mood NOT a crisis signal, expresses a wish/longing/memory, or explicitly asks you to build/make something.
content = a single-file, beautifully responsive, interactive HTML/CSS/JS page as a raw string — pure runnable HTML only, no markdown fences.

Examples that MUST be "experience": "I feel overwhelmed today" · "I miss the ocean" · "make me a 2048 game" · "I need a quiet place to breathe"

STRICT RULES FOR "experience" CONTENT:
1. Soft, modern design using Tailwind CDN (<script src="https://cdn.tailwindcss.com"></script>).
2. All in-page text in ENGLISH.
3. Genuine interactivity (clickable animations, taps, drags, mini game, or interactive breather/wish jar).
4. For requested games (2048, tic-tac-toe, etc.): logic MUST actually work — keyboard AND on-screen/touch controls both required, complete and syntactically valid, never truncated.
5. Never wrap in markdown fences.
6. For any keyboard-controlled content: set <html>/<body> to overflow:hidden, height:100%, margin:0 so the page never scrolls; call event.preventDefault() on arrow keys/space in the keydown listener BEFORE game logic; size the board with vh/vw or % units so it always fits without scrolling.
7. VARIETY: check conversation history — if earlier experience content used a certain palette/motif/interaction style, deliberately choose a different one this time so it doesn't feel repetitive, while still matching the current emotional tone.

—— moodTag (required for every mode) ——
A short 1-4 word label capturing the emotional theme of THIS message, e.g. "overwhelmed", "missing someone", "anxious about work", "lonely at night". Use "neutral" for plain chat with no real emotional content. Always in English, lowercase, no punctuation.

Use conversation history for context — if the user says "make it gentler" or "again but blue", refer back to what was discussed before.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    mode: { type: "STRING", enum: ["chat", "experience", "support"] },
    content: { type: "STRING", description: "Reply text (chat/support) or full HTML page source (experience)" },
    moodTag: { type: "STRING", description: "Short 1-4 word emotional theme label, or 'neutral'" }
  },
  required: ["mode", "content", "moodTag"],
  propertyOrdering: ["mode", "content", "moodTag"]
};

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function callGeminiOnce(apiKey, contents) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey.trim()}`;
  const apiRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    })
  });

  if (!apiRes.ok) {
    const errData = await apiRes.json().catch(() => ({}));
    const err = new Error(errData.error?.message || `Google API Error: ${apiRes.status}`);
    err.status = apiRes.status;
    throw err;
  }

  const data = await apiRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    const finishReason = data.candidates?.[0]?.finishReason;
    const err = new Error(finishReason === 'SAFETY' ? 'blocked_by_safety' : 'empty_response');
    err.status = 502;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    const err = new Error('malformed_json');
    err.status = 502;
    throw err;
  }

  if (!parsed.mode || !parsed.content) {
    const err = new Error('missing_fields');
    err.status = 502;
    throw err;
  }

  return parsed;
}

async function callGeminiWithRetry(apiKey, contents, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callGeminiOnce(apiKey, contents);
    } catch (err) {
      lastError = err;
      const retryable = isRetryableStatus(err.status) || err.message === 'malformed_json' || err.message === 'empty_response';
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in environment variables.' });
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();

  cleanupRateLimitStore();

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: "You're sending messages a little fast — take a breath, and try again in a moment."
    });
  }

  const { prompt, history } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // 如果带了登录用户的token，用数据库里的真实历史记录（跨设备一致），
  // 否则退回到前端传来的临时history（访客模式）
  const authHeader = req.headers['authorization'] || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let userId = null;
  let dbHistory = null;
  let supabaseServer = null;

  if (accessToken) {
    try {
      supabaseServer = createSupabaseServerClient(accessToken);
      const { data: userData } = await supabaseServer.auth.getUser(accessToken);
      userId = userData?.user?.id || null;

      if (userId) {
        const { data: rows } = await supabaseServer
          .from('mood_logs')
          .select('role, content, created_at')
          .order('created_at', { ascending: false })
          .limit(12);
        if (rows) {
          dbHistory = rows.reverse().map(r => ({ role: r.role, text: r.content }));
        }
      }
    } catch (e) {
      console.error('Supabase auth/history lookup failed (continuing as guest):', e.message);
    }
  }

  const effectiveHistory = dbHistory || (Array.isArray(history) ? history : []);

  const contents = [
    ...effectiveHistory.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }]
    })),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  try {
    const parsed = await callGeminiWithRetry(apiKey, contents, 3);

    let content = parsed.content;
    if (parsed.mode === 'experience') {
      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
      }
      const antiScrollCSS = `<style>html,body{overflow:hidden!important;height:100%!important;margin:0!important;padding:0!important;}</style>`;
      content = content.includes('</head>')
        ? content.replace('</head>', `${antiScrollCSS}</head>`)
        : antiScrollCSS + content;
    }

    // 登录用户：把这轮对话存进mood_logs，供下次"记忆"和未来情绪趋势用。
    // 存的是文字内容，experience模式不存整段HTML(那个交给favorites表，用户主动收藏才存)
    if (userId && supabaseServer) {
      const assistantContentToStore = parsed.mode === 'experience'
        ? '[created a space]'
        : content;

      supabaseServer.from('mood_logs').insert([
        { user_id: userId, role: 'user', mode: null, content: prompt, mood_tag: parsed.moodTag },
        { user_id: userId, role: 'assistant', mode: parsed.mode, content: assistantContentToStore, mood_tag: parsed.moodTag }
      ]).then(({ error }) => {
        if (error) console.error('Failed to save mood_logs:', error.message);
      });
      // 故意不 await —— 存历史不应该拖慢用户看到回复的速度，失败了也不影响主流程
    }

    return res.status(200).json({ mode: parsed.mode, content, moodTag: parsed.moodTag });

  } catch (error) {
    console.error('Generation Error after retries:', error.message, error.status || '');
    return res.status(200).json({
      mode: 'chat',
      content: getStaticFallback(),
      moodTag: 'neutral',
      _fallback: true
    });
  }
}
