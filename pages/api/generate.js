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

  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing in environment variables.' });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 调用 Google 官方稳定版 v1 REST 接口 (gemini-1.5-flash)
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
          temperature: 0.8,
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

    // 清理 markdown 格式
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
