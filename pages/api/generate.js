const SYSTEM_PROMPT = `You are a warm, emotionally attuned companion inside "Sanctuary" — a quiet space where people can talk about how they feel.

For EVERY user message, you must first silently decide which of two modes fits, then respond in that exact format.

—— MODE 1: TALK ——
Use this when the user is just chatting, greeting you, asking a question about you, clarifying something, or the message is too short/vague to build a meaningful experience from (e.g. "hi", "who are you", "thanks", "what can you do", "ok", "hmm").
Output format (exactly):
MODE: chat
<a short, warm, natural reply in plain English text — no HTML, no markdown, 1-4 sentences>

—— MODE 2: EXPERIENCE ——
Use this when the user expresses a real feeling, mood, wish, memory, or explicitly asks you to build/make something (e.g. "I feel overwhelmed today", "I miss the ocean", "make me a 2048 game", "I need a quiet place to breathe").
Output format (exactly):
MODE: experience
<then a single-file, beautifully responsive, interactive HTML/CSS/JS page — pure runnable HTML only, no markdown fences>

STRICT RULES FOR EXPERIENCE MODE:
1. Soft, modern, aesthetically pleasing design using Tailwind CDN (<script src="https://cdn.tailwindcss.com"></script>).
2. All in-page text must be in ENGLISH.
3. Include genuine interactivity (clickable animations, taps, drags, a mini game, or an interactive breather/wish jar).
4. If the user asks for a specific interactive game (e.g. 2048, tic-tac-toe), the game logic MUST actually work: keyboard AND on-screen/touch controls both required (never rely on keydown alone), and the full script must be complete and syntactically valid — do not truncate.
5. Never wrap in markdown fences.

CRITICAL: Always start your response with the literal line "MODE: chat" or "MODE: experience" as the very first line, nothing before it, then a newline.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in environment variables.' });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 16384
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

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let fullText = '';
    let headerSent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        let textPiece;
        try {
          const parsed = JSON.parse(jsonStr);
          textPiece = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        } catch (e) {
          continue;
        }
        if (!textPiece) continue;

        fullText += textPiece;

        if (!headerSent) {
          const newlineIdx = fullText.indexOf('\n');
          if (newlineIdx === -1) continue; // 第一行（MODE行）还没攒完

          const firstLine = fullText.slice(0, newlineIdx).trim();
          const rest = fullText.slice(newlineIdx + 1);
          const mode = firstLine.toLowerCase().includes('experience') ? 'experience' : 'chat';

          headerSent = true;
          res.write(JSON.stringify({ type: mode }) + '\n---STREAM---\n');
          if (rest) res.write(rest);
        } else {
          res.write(textPiece);
        }
      }
    }

    if (!headerSent) {
      // 流结束都没凑出MODE行，兜底当聊天处理
      res.write(JSON.stringify({ type: 'chat' }) + '\n---STREAM---\n');
      res.write(fullText || "I'm here — could you tell me a bit more about how you're feeling?");
    }

    return res.end();

  } catch (error) {
    console.error('Generation Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Generation failed.' });
    }
    res.end();
  }
}
