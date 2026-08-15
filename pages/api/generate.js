// ⚠️ 简易内存限流：仅适用于低流量/单实例场景。
// Vercel Serverless 在高并发下会启动多个实例，这个 Map 不会在实例间共享，
// 限流效果会打折扣。真正要用于生产环境防滥用，建议换成 Upstash Redis。
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分钟窗口
const RATE_LIMIT_MAX_REQUESTS = 8; // 每个IP每分钟最多8次请求

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count += 1;
  return true;
}

function cleanupRateLimitStore() {
  if (Math.random() > 0.02) return;
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(ip);
    }
  }
}

// 完全不依赖模型调用的静态安抚语——用于Gemini重试多次仍失败的兜底场景
const STATIC_FALLBACK_MESSAGES = [
  "I'm having a little trouble reaching my thoughts right now, but I'm still here with you. Would you like to try telling me again in a moment?",
  "Something's not quite connecting on my end. Take a breath with me — and if you'd like, try again shortly.",
  "I couldn't quite create something for you just now, but your feelings are still heard. Give it another try in a bit?"
];

function getStaticFallback() {
  return STATIC_FALLBACK_MESSAGES[Math.floor(Math.random() * STATIC_FALLBACK_MESSAGES.length)];
}

const SYSTEM_PROMPT = `You are a warm, emotionally attuned companion inside "Sanctuary" — a quiet space where people can talk about how they feel.

DEFAULT TO "chat" MODE. Only switch to "experience" mode when the user's message clearly expresses a specific feeling, mood, wish, or memory — or explicitly asks you to build/make/create something. When in doubt, choose "chat".

—— MODE "chat" (this is the default — use it most of the time) ——
Use this for:
- Greetings and small talk ("hi", "hello", "how are
