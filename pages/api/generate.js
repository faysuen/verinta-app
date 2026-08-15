export const config = {
  runtime: 'edge', // 开启 Edge Runtime，完美适配流式传输，0 等待延迟
};

const SYSTEM_PROMPT = `You are a front-end developer. Output ONLY pure HTML code (with inline CSS/JS). No markdown. All UI in English. Keep code concise, fast-generating, and bug-free.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    return new Response(JSON.stringify({ error: 'API Key is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 调用 OpenRouter 流式 API
    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vercel.com',
        'X-Title': 'Micro App Generator',
      },
      body: JSON.stringify({
        model: 'google/gemma-2-9b-it:free',
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1500,
      }),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json();
      return new Response(JSON.stringify({ error: err.error?.message || 'OpenRouter Error' }), {
        status: apiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 使用 TransformStream 实时解析 SSE 并转换成纯文本流给前端
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk);
        const lines = text.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch (e) {
              // 忽略半包 JSON 解析异常
            }
          }
        }
      },
    });

    return new Response(apiRes.body.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Generation failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
