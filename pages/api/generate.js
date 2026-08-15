import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `You are a world-class front-end developer and micro-game/micro-app creator.
The user will give you a single phrase expressing their feeling, need, or idea.
Your goal is to instantly design and write a single-file, highly interactive HTML/CSS/JS micro-app or mini-game based on their deep intent.

【STRICT RULES】:
1. Output ONLY pure, runnable HTML code (including <style> and <script>).
2. All UI, text, and labels inside the generated micro-app MUST be in ENGLISH.
3. Make the design modern, polished, and aesthetic (Include Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>).
4. All interactions MUST be fully functional (e.g., fluid click feedbacks, drag-and-drop, canvas animations, random generators, sound/visual effects).
5. DO NOT wrap code in markdown fences (e.g., NO \`\`\`html or \`\`\`). Return ONLY raw HTML text.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. 检查环境变量是否存在
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel Environment Variables.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      `User request: ${prompt}`
    ]);

    const response = await result.response;
    let code = response.text() || '';
    code = code.trim();
    
    if (code.startsWith('```')) {
      code = code.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
    }

    res.status(200).json({ html: code });
  } catch (error) {
    console.error('Gemini API Error:', error);
    // 返回真实的错误信息给前端弹窗
    res.status(500).json({ error: error.message || 'Generation failed.' });
  }
}
