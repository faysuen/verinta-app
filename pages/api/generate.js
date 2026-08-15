const SYSTEM_PROMPT = `You are a world-class front-end developer and micro-game/micro-app creator.
The user will give you a single phrase expressing their feeling, need, or idea.
Your goal is to instantly design and write a single-file, highly interactive HTML/CSS/JS micro-app or mini-game based on their deep intent.

【STRICT RULES】:
1. Output ONLY pure, runnable HTML code (including <style> and <script>).
2. All UI, text, and labels inside the generated micro-app MUST be in ENGLISH.
3. Make the design modern, polished, and aesthetic (Include Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>).
4. All interactions MUST be fully functional (e.g., fluid click feedbacks, drag-and-drop, canvas animations, random generators, sound/visual effects).
5. DO NOT wrap code in markdown fences (e.g., NO \`\`\`html or \`\`\`). Return ONLY raw HTML text.

【UNRELATED PROMPT HANDLING】:
If the user's prompt is unrelated to stress relief, decision making, or is a general knowledge question (e.g., "Capital of France?", "Write a poem"):
Do NOT give a text response. Instead, create a fun, interactive 'Knowledge Card' or 'Text Tool' (e.g., a flip card with the answer, or a simple text editor with copy/paste buttons). ALWAYS return a functional UI.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 使用 OPENROUTER_API_KEY（或者保持 GEMINI_API_KEY，根据你在 Vercel 设定的变量名）
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key is not set in Environment Variables.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // 通过 OpenRouter 标准 OpenAI 兼容接口调用 Gemini 2.0 Flash
    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      throw new Error(data.error?.message || `API Error: ${apiRes.status}`);
    }

    let code = data.choices?.[0]?.message?.content || '';
    code = code.trim();

    if (code.startsWith('```')) {
      code = code.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
    }

    return res.status(200).json({ html: code });
  } catch (error) {
    console.error('Generation Error:', error);
    return res.status(500).json({ error: error.message || 'Generation failed.' });
  }
}
