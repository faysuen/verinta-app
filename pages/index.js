import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi, I'm here with you. 🌿 Tell me how you're feeling right now — even a single word is enough. (e.g. \"I feel overwhelmed today\", \"I miss the ocean\", \"I just need a quiet place to breathe\")",
      html: null
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

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
        throw new Error(errorData.error || 'Something went wrong while creating your space.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      let mode = null; // 'chat' | 'experience'
      let contentBuf = '';
      let headerParsed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decoded = decoder.decode(value, { stream: true });

        if (!headerParsed) {
          raw += decoded;
          const delimIdx = raw.indexOf('\n---STREAM---\n');
          if (delimIdx === -1) continue; // 头部还没收全，继续等下一块

          const headerStr = raw.slice(0, delimIdx);
          try {
            mode = JSON.parse(headerStr).type;
          } catch {
            mode = 'chat';
          }
          headerParsed = true;
          contentBuf = raw.slice(delimIdx + '\n---STREAM---\n'.length);
        } else {
          contentBuf += decoded;
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

      // 流结束但一直没解析出 header 的兜底情况（理论上不该发生，防御一下）
      if (!headerParsed && raw) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: raw,
            html: null
          };
          return updated;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
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

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.avatar}>🌸</div>
        <div>
          <h1 style={styles.title}>Sanctuary</h1>
          <p style={styles.status}>A quiet space, made just for how you feel</p>
        </div>
      </header>

      <main style={styles.chatBox}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.messageWrapper,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div
              style={{
                ...styles.bubble,
                ...(msg.role === 'user' ? styles.userBubble : styles.aiBubble)
              }}
            >
              <p style={styles.msgText}>{msg.content}</p>

              {msg.html && (
                <div style={styles.previewCard}>
                  <iframe
                    srcDoc={msg.html}
                    title={`preview-${index}`}
                    style={styles.iframe}
                    sandbox="allow-scripts allow-modals allow-same-origin"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </main>

      <footer style={styles.inputArea}>
        <div style={styles.inputContainer}>
          <textarea
            style={styles.textarea}
            placeholder="How are you feeling right now? (Press Enter to share)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              ...styles.sendBtn,
              opacity: loading || !input.trim() ? 0.4 : 1
            }}
          >
            Share →
          </button>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'linear-gradient(160deg, #fdf6f0 0%, #f3e8ff 50%, #e0f2ff 100%)',
    color: '#3f3a4b',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '18px 24px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    backdropFilter: 'blur(8px)',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  title: {
    fontSize: '17px',
    fontWeight: '600',
    margin: 0,
    color: '#4a3f5c',
    letterSpacing: '0.3px',
  },
  status: {
    fontSize: '12.5px',
    color: '#8a7ea3',
    margin: 0,
  },
  chatBox: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '900px',
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  messageWrapper: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: '18px',
    padding: '14px 18px',
    lineHeight: '1.6',
    fontSize: '15px',
  },
  userBubble: {
    backgroundColor: '#ffffff',
    color: '#4a3f5c',
    borderBottomRightRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  aiBubble: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    color: '#4a3f5c',
    border: '1px solid rgba(255,255,255,0.8)',
    borderBottomLeftRadius: '4px',
    width: '100%',
    backdropFilter: 'blur(6px)',
  },
  msgText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  previewCard: {
    marginTop: '14px',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.06)',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  },
  iframe: {
    width: '100%',
    height: '450px',
    border: 'none',
  },
  inputArea: {
    padding: '18px 24px',
    borderTop: '1px solid rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    backdropFilter: 'blur(8px)',
  },
  inputContainer: {
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#ffffff',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: '16px',
    padding: '10px 14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  },
  textarea: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#4a3f5c',
    fontSize: '15px',
    resize: 'none',
    fontFamily: 'inherit',
  },
  sendBtn: {
    background: 'linear-gradient(135deg, #f5b7c4, #c8a2e0)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    padding: '9px 18px',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
  }
};
