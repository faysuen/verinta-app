const handleSend = async () => {
  if (!input.trim() || loading) return;

  const userText = input.trim();
  setInput('');

  setMessages((prev) => [
    ...prev,
    { role: 'user', content: userText, html: null },
    { role: 'assistant', content: '🌙 ...', html: null }
  ]);
  setLoading(true);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userText }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Something went wrong.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let mode = null;       // 'chat' | 'experience'
    let contentBuf = '';   // 正文内容（文字回复 或 html代码）
    let headerParsed = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      raw += decoder.decode(value, { stream: true });

      if (!headerParsed) {
        const delimIdx = raw.indexOf('\n---STREAM---\n');
        if (delimIdx === -1) continue; // 头部还没收全，继续等

        const headerStr = raw.slice(0, delimIdx);
        try {
          mode = JSON.parse(headerStr).type;
        } catch {
          mode = 'chat';
        }
        headerParsed = true;
        contentBuf = raw.slice(delimIdx + '\n---STREAM---\n'.length);
      } else {
        contentBuf += decoder.decode(value, { stream: true });
      }

      if (!headerParsed) continue;

      if (mode === 'experience') {
        let cleanCode = contentBuf.trim();
        if (cleanCode.startsWith('```')) {
          cleanCode = cleanCode.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
        }
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'I made this little space for you 💛',
            html: cleanCode
          };
          return updated;
        });
      } else {
        // 纯聊天：直接把文字流式打到气泡里，不做iframe
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: contentBuf,
            html: null
          };
          return updated;
        });
      }
    }
  } catch (err) {
    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        role: 'assistant',
        content: `I'm sorry, something didn't go as planned: ${err.message}`,
        html: null
      };
      return updated;
    });
  } finally {
    setLoading(false);
  }
};
