const SYSTEM_PROMPT = `You are a front-end developer. Output ONLY pure, executable single-file HTML code (with inline CSS/JS). No markdown. All UI in English. Keep the layout, logic, and animations modern but lightweight so it generates extremely fast.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return res.status(500).json({ error: 'API Key missing.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vercel.com',
        'X-Title': 'Micro App Generator'
      },
      body: JSON.stringify({
        // 1. 使用生成速度极快的专门代码模型或 lightweight 路由
        model: 'qwen/qwen-2.5-coder-32b-instruct:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        // 2. 限制最大生成长度，大幅削减等待时间（微应用 2000 token 足够）
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
