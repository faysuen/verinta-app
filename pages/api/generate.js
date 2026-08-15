const SYSTEM_PROMPT = `You are a world-class front-end developer and micro-app creator.
The user will give you a single phrase expressing their feeling, need, or idea.
Your goal is to instantly design and write a single-file, highly interactive HTML/CSS/JS micro-app or mini-game.

【STRICT RULES】:
1. Output ONLY pure, runnable HTML code (including <style> and <script>).
2. All UI, text, and labels inside the generated micro-app MUST be in ENGLISH.
3. Include Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>.
4. All interactions MUST be fully functional.
5. DO NOT wrap code in markdown fences (NO \`\`\`html or \`\`\`). Return ONLY raw HTML text.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in environment variables.' });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 锁定 Google 官方稳定版 v1 接口与 gemini-1.5-flash 模型
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;

    const apiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      })
    });

    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Google API Error: ${apiRes.status}`);
    }

    const data = await apiRes.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 清理可能包含的 markdown 代码块标记
    const cleanedHtml = generatedText
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(cleanedHtml);

  } catch (error) {
    console.error('Generation Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Generation failed.' });
    }
    res.end();
  }
}
