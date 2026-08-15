import { GoogleGenAI } from '@google/genai';

// 初始化 Google GenAI 官方 SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel Environment Variables.' });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // 使用官方 SDK 调用当前标准的可用模型别名
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `${SYSTEM_PROMPT}\n\nUser request: ${prompt}`,
    });

    let code = response.text || '';
    code = code.trim();

    if (code.startsWith('```')) {
      code = code.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
    }

    res.status(200).json({ html: code });
  } catch (error) {
    console.error('Gemini GenAI SDK Error:', error);
    res.status(500).json({ error: error.message || 'Generation failed. Please try again.' });
  }
}
