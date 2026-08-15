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

    // 1. 实时获取你的 API Key 当前允许调用的最新模型列表
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();

    if (!listRes.ok || !listData.models) {
      throw new Error(`获取可用模型列表失败: ${listData.error?.message || listRes.status}`);
    }

    // 2. 自动过滤出支持 generateContent 方法的模型
    const availableModels = listData.models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name); // 这里的名字是 Google 官方返回的完整路径，如 "models/gemini-..."

    if (availableModels.length === 0) {
      throw new Error("你的 GEMINI_API_KEY 下没有任何支持生成内容的可用模型，请检查 Google AI Studio 权限。");
    }

    // 优先匹配包含 'flash' 的模型，没有的话直接取列表第一个
    const targetModel = availableModels.find(m => m.includes('flash')) || availableModels[0];

    // 3. 使用 Google 官方返回的精确模型路径发送生成请求
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${targetModel}:generateContent?key=${apiKey}`;

    const apiRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${SYSTEM_PROMPT}\n\nUser request: ${prompt}` }]
          }
        ]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      throw new Error(data.error?.message || `API Error: ${apiRes.status}`);
    }

    let code = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    code = code.trim();

    if (code.startsWith('```')) {
      code = code.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
    }

    res.status(200).json({ html: code });
  } catch (error) {
    console.error('Gemini API Dynamic Model Error:', error);
    res.status(500).json({ error: error.message || 'Generation failed. Please try again.' });
  }
}
