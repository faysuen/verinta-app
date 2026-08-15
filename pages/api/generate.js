const SYSTEM_PROMPT = `You are a front-end developer. Output ONLY pure HTML code (with inline CSS/JS). No markdown. All UI in English. Keep code concise and bug-free.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return res.status(500).json({ error: 'API Key is missing.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // Stream fetch to OpenRouter using a fast free model
    const apiRes = await fetch('[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': '[https://vercel.com](https://vercel.com)',
        'X-Title': 'Micro App Generator'
      },
      body: JSON.stringify({
        model: 'google/gemma-2-9b-it:free', // 吐字速度极快的免费模型
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500
      })
    });

    if (!apiRes.ok) {
      const err = await apiRes.json();
      throw new Error(err.error?.message || 'OpenRouter Error');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = apiRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.replace('data: ', '');
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(content);
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }

    res.end();
  } catch (error) {
    console.error('Generation Error:', error);
    return res.status(500).json({ error: error.message || 'Generation failed.' });
  }
}
