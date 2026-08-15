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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel Environment Variables.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // 备选模型列表（优先尝试 gemini-2.0-flash，如果报错自动切换到 standard 模型）
    const candidateModels = ['models/gemini-2.0-flash', 'models/gemini-1.5-flash'];
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

        const apiRes = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: {
              model: modelName
            },
            input: `${SYSTEM_PROMPT}\n\nUser request: ${prompt}`
          })
        });

        const data = await apiRes.json();

        if (apiRes.ok) {
          let code = data.output || data.outputs?.[0]?.text || data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          code = code.trim();

          if (code.startsWith('```')) {
            code = code.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
          }

          return res.status(200).json({ html: code });
        } else {
          lastError = data.error?.message || `API Error: ${apiRes.status}`;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    throw new Error(lastError || 'All model endpoints failed.');
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: error.message || 'Generation failed. Please try again.' });
  }
}
