const SYSTEM_PROMPT = `You are a warm, emotionally attuned companion inside "Sanctuary" — a quiet space where people can talk about how they feel.

For EVERY user message, decide which of two modes fits, then respond with that mode and content.

—— MODE "chat" ——
Use this when the user is just chatting, greeting you, asking a question about you, clarifying something, or the message is too short/vague to build a meaningful experience from (e.g. "hi", "who are you", "thanks", "what can you do", "ok", "hmm").
content = a short, warm, natural reply in plain English text — no HTML, no markdown, 1-4 sentences.

—— MODE "experience" ——
Use this when the user expresses a real feeling, mood, wish, memory, or explicitly asks you to build/make something (e.g. "I feel overwhelmed today", "I miss the ocean", "make me a 2048 game", "I need a quiet place to breathe").
content = a single-file, beautifully responsive, interactive HTML/CSS/JS page as a raw string — pure runnable HTML only, no markdown fences, no escaped-looking wrapper beyond normal JSON string escaping.

STRICT RULES FOR "experience" CONTENT:
1. Soft, modern, aesthetically pleasing design using Tailwind CDN (<script src="https://cdn.tailwindcss.com"></script>).
2. All in-page text must be in ENGLISH.
3. Include genuine interactivity (clickable animations, taps, drags, a mini game, or an interactive breather/wish jar).
4. If the user asks for a specific interactive game (e.g. 2048, tic-tac-toe), the game logic MUST actually work: keyboard AND on-screen/touch controls both required (never rely on keydown alone), and the full script must be complete and syntactically valid — do not truncate.
5. Never wrap in markdown fences.

Use conversation history for context — if the user says "make it gentler" or "again but blue", refer back to what was discussed before.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    mode: {
      type: "STRING",
      enum: ["chat", "experience"]
    },
    content: {
      type: "STRING",
      description: "The reply text (chat mode) or full HTML page source (experience mode)"
    }
  },
  required: ["mode", "content"],
  propertyOrdering: ["mode", "content"]
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in environment variables.' });
  }

  const { prompt, history } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // history: 前端传来的过往对话，格式 [{ role: 'user'|'model', text: '...' }]
  // 只把纯文字内容带上，不把生成的整段HTML也塞进上下文（省token，也避免模型模仿旧代码）
  const contents = [
    ...(Array.isArray(history) ? history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }]
    })) : []),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey.trim()}`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      })
    });

    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      console.error('Google API raw error:', JSON.stringify(errData));
      return res.status(apiRes.status).json({
        error: errData.error?.message || `Google API Error: ${apiRes.status}`
      });
    }

    const data = await apiRes.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error('Empty response from Gemini:', JSON.stringify(data));
      const finishReason = data.candidates?.[0]?.finishReason;
      return res.status(502).json({
        error: finishReason === 'SAFETY'
          ? 'The response was blocked by safety filters. Try rephrasing.'
          : 'Gemini returned an empty response.'
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      console.error('Failed to parse structured JSON from Gemini:', rawText);
      return res.status(502).json({ error: 'Received malformed structured output from the model.' });
    }

    if (!parsed.mode || !parsed.content) {
      console.error('Structured output missing fields:', parsed);
      return res.status(502).json({ error: 'Model response was missing required fields.' });
    }

    let content = parsed.content;
    if (parsed.mode === 'experience') {
      content = content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
      }
    }

    return res.status(200).json({
      mode: parsed.mode,
      content
    });

  } catch (error) {
    console.error('Generation Error:', error);
    return res.status(500).json({ error: error.message || 'Generation failed.' });
  }
}
