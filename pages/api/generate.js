const SYSTEM_PROMPT = `You are an empathetic, world-class creative technologist and emotional resonance designer.
The user will express their feeling, mood, wish, or fleeting thought (e.g., "I feel overwhelmed today", "I miss the ocean", "I need a quiet place to breathe").
Your mission is to parse the emotional core of their input and instantly generate a single-file, beautifully responsive, highly interactive HTML/CSS/JS experience (a mood sanctuary, mini interactive art piece, relaxing game, or visual comfort space) to provide warmth, emotional comfort, or joy.
【STRICT CREATIVE & TECHNICAL RULES】:
1. Tone & Aesthetic: Soft, modern, aesthetically pleasing design. Use beautiful Tailwind color palettes (pastel, warm amber, soothing blues, cosmic darks depending on the mood).
2. Content Language: All text, instructions, and interactive elements INSIDE the generated web page MUST be in ENGLISH.
3. Tech Stack: Include Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>).
4. Interactive & Engaging: Include playful or relaxing interactions (e.g., clickable soothing animations, soundless ambient visuals, meditative tap games, interactive breathers, interactive wish jars, or lighthearted mini-challenges).
5. Output Format: Output ONLY pure, runnable HTML code (including <style> and <script>).
6. DO NOT wrap code in markdown fences (NO \`\`\`html or \`\`\`). Return ONLY raw HTML text.`;

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
    // 用流式接口 streamGenerateContent，并加 alt=sse 让返回是标准SSE格式，方便逐行解析
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 8192
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

    // 告诉客户端这是流式响应
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedAny = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 格式是一行一行的 "data: {...}"，按行拆开处理
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 最后一行可能不完整，留到下一次拼接

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const textPiece = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textPiece) {
            receivedAny = true;
            res.write(textPiece); // 实时把这一小块文字发给前端
          }
        } catch (e) {
          // 有些 chunk 可能不是完整JSON，忽略即可，不用中断整个流程
        }
      }
    }

    if (!receivedAny) {
      console.error('Empty stream from Gemini for prompt:', prompt);
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
