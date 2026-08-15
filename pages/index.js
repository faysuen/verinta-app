import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey there! I'm your AI Micro-App Studio. Tell me what you'd like to build today (e.g., 'A pomodoro timer with ambient sounds' or 'A classic 2048 mini-game')",
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

    // Append user message & temporary AI loading placeholder
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userText, html: null },
      { role: 'assistant', content: '⚡ Generating your app in real-time...', html: '' }
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
        throw new Error(errorData.error || 'Generation failed.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullCode = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullCode += chunk;

        // Clean potential markdown blocks on the fly
        let cleanCode = fullCode.trim();
        if (cleanCode.startsWith('```')) {
          cleanCode = cleanCode.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
        }

        // Live update the last message with received code
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          updated[lastIdx] = {
            role: 'assistant',
            content: 'Here is your micro-app:',
            html: cleanCode
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
          content: `Error: ${err.message}`,
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
        <div style={styles.avatar}>✦</div>
        <div>
          <h1 style={styles.title}>AI Micro App Studio</h1>
          <p style={styles.status}>● Online & Streaming Ready</p>
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
            placeholder="Type your micro-app idea here... (Press Enter to send)"
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
            Send →
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
    backgroundColor: '#0a0a0a',
    color: '#ededed',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 24px',
    borderBottom: '1px solid #222222',
    backgroundColor: '#000000',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    color: '#000000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '18px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '700',
    margin: 0,
    letterSpacing: '0.5px',
  },
  status: {
    fontSize: '12px',
    color: '#10b981',
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
    borderRadius: '16px',
    padding: '14px 18px',
    lineHeight: '1.5',
    fontSize: '15px',
  },
  userBubble: {
    backgroundColor: '#ffffff',
    color: '#000000',
    borderBottomRightRadius: '4px',
  },
  aiBubble: {
    backgroundColor: '#161616',
    color: '#ededed',
    border: '1px solid #262626',
    borderBottomLeftRadius: '4px',
    width: '100%',
  },
  msgText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
  },
  previewCard: {
    marginTop: '14px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid #333333',
    backgroundColor: '#ffffff',
  },
  iframe: {
    width: '100%',
    height: '450px',
    border: 'none',
  },
  inputArea: {
    padding: '16px 24px',
    borderTop: '1px solid #222222',
    backgroundColor: '#000000',
  },
  inputContainer: {
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '8px 12px',
  },
  textarea: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '15px',
    resize: 'none',
    fontFamily: 'inherit',
  },
  sendBtn: {
    backgroundColor: '#ffffff',
    color: '#000000',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
  }
};
