// ⚠️ 简易内存限流：仅适用于低流量/单实例场景。
// Vercel Serverless 在高并发下会启动多个实例，这个 Map 不会在实例间共享，
// 限流效果会打折扣。真正要用于生产环境防滥用，建议换成 Upstash Redis。
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分钟窗口
const RATE_LIMIT_MAX_REQUESTS = 8; // 每个IP每分钟最多8次请求

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

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

// 完全不依赖模型调用的静态安抚语——用于Gemini重试多次仍失败的兜底场景
const STATIC_FALLBACK_MESSAGES = [
  "I'm having a little trouble reaching my thoughts right now, but I'm still here with you. Would you like to try telling me again in a moment?",
  "Something's not quite connecting on my end. Take a breath with me — and if you'd like, try again shortly.",
  "I couldn't quite create something for you just now, but your feelings are still heard. Give it another try in a bit?"
];

function getStaticFallback() {
  return STATIC_FALLBACK_MESSAGES[Math.floor(Math.random() * STATIC_FALLBACK_MESSAGES.length)];
}

const SYSTEM_PROMPT = `You are a warm, emotionally attuned companion inside "Sanctuary" — a quiet space where people can talk about how they feel.

DEFAULT TO "chat" MODE. Only switch to "experience" mode when the user's message clearly expresses a specific feeling, mood, wish, or memory — or explicitly asks you to build/make/create something. When in doubt, choose "chat".

—— MODE "chat" (this is the default — use it most of the time) ——
Use this for:
- Greetings and small talk ("hi", "hello", "how are you")
- Questions about you or the app ("who are you", "what can you do", "what is this")
- Short acknowledgments ("ok", "thanks", "cool", "haha")
- General statements that aren't really about the user's own emotional state ("nice weather today", "I'm bored")
- Anything ambiguous or unclear
content = a short, warm, natural reply in plain English text — no HTML, no markdown, 1-4 sentences. Just talk like a caring friend. Do NOT offer to build something unless it's clearly relevant.

Examples that MUST be "chat":
- "hi" → chat
- "how's it going" → chat
- "nice weather today" → chat
- "what can you do" → chat
- "lol ok" → chat

—— MODE "experience" (use sparingly — only for clear emotional expression or explicit build requests) ——
Use this ONLY when the user:
- States a specific feeling or emotional state ("I feel overwhelmed today", "I'm anxious about tomorrow")
- Expresses a wish, longing, or memory ("I miss the ocean", "I wish I could relax")
- Explicitly asks you to build/make something ("make me a 2048 game", "build me something calming")

Examples that MUST be "experience":
- "I feel overwhelmed today" → experience
- "I miss the ocean" → experience
- "make me a 2048 game" → experience
- "I need a quiet place to breathe" → experience

content = a single-file, beautifully responsive, interactive HTML/CSS/JS page as a raw string — pure runnable HTML only, no markdown fences, no escaped-looking wrapper beyond normal JSON string escaping.

STRICT RULES FOR "experience" CONTENT:
1. Soft, modern, aesthetically pleasing design using Tailwind CDN (<script src="https://cdn.tailwindcss.com"></script>).
2. All in-page text must be in ENGLISH.
3. Include genuine interactivity (clickable animations, taps, drags, a mini game, or an interactive breather/wish jar).
4. If the user asks for a specific interactive game (e.g. 2048, tic-tac-toe), the game logic MUST actually work: keyboard AND on-screen/touch controls both required (never rely on keydown alone), and the full script must be complete and syntactically valid — do not truncate.
5. Never wrap in markdown fences.
6. CRITICAL for any keyboard-controlled content (games like 2048, snake, etc.):
   - Set <html> and <body> to overflow: hidden and height: 100% / margin: 0 so the page NEVER scrolls, regardless of content size.
   - In the keydown event listener, call event.preventDefault() for ArrowUp/ArrowDown/ArrowLeft/ArrowRight (and Space if used) BEFORE any game logic, to stop the browser's native page-scroll behavior from hijacking the input.
   - Size the game board with relative/viewport units (vh/vw or 100%) so it always fits within the visible area without needing to scroll to see any part of it.

Use conversation history for context — if the user says "make it gentler" or "again but blue", refer back to what was discussed before.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    mode: { type: "STRING", enum: ["chat", "experience"] },
    content: {
      type: "STRING",
      description: "The reply text (chat mode) or full HTML page source (experience mode)"
    }
  },
  required: ["mode", "content"],
  propertyOrdering: ["mode", "content"]
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
        temperature: 0.4, // 调低，让 chat/experience 判断更稳定
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
    err.finishReason = finishReason;
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
      const isLastAttempt = attempt === maxAttempts;

      if (!retryable || isLastAttempt) {
        throw err;
      }

      const backoffMs = 500 * attempt;
      console.warn(`Gemini call failed (attempt ${attempt}/${maxAttempts}): ${err.message}. Retrying in ${backoffMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
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
    .toString()
    .split(',')[0]
    .trim();

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

  const contents = [
    ...(Array.isArray(history) ? history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }]
    })) : []),
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

      // 保险丝：无论模型有没有自己处理好防滚动，强制注入CSS兜底，
      // 防止方向键控制类内容因为出现滚动条而"按了没反应"
      const antiScrollCSS = `<style>html,body{overflow:hidden!important;height:100%!important;margin:0!important;padding:0!important;}</style>`;
      if (content.includes('</head>')) {
        content = content.replace('</head>', `${antiScrollCSS}</head>`);
      } else {
        content = antiScrollCSS + content;
      }
    }

    return res.status(200).json({ mode: parsed.mode, content });

  } catch (error) {
    console.error('Generation Error after retries:', error.message, error.status || '');

    return res.status(200).json({
      mode: 'chat',
      content: getStaticFallback(),
      _fallback: true
    });
  }
}
