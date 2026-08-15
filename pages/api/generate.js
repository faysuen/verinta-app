const SYSTEM_PROMPT = `You are a front-end developer. Output ONLY pure, executable single-file HTML code (with inline CSS/JS). No markdown. All UI in English. Keep the layout, logic, and animations modern but lightweight so it generates extremely fast.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return res.status(500).json({ error: 'API Key missing. Please set OPENROUTER_API_KEY in Vercel Environment Variables.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // 使用 OpenRouter 官方全局免费路由，由平台自动分发至当前可用的免费模型
    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vercel.com',
        'X-Title': 'Micro App Generator'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      throw new Error(data.error?.message || `OpenRouter Error: ${apiRes.status}`);
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
