import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hey! 我是你的微应用助手。告诉我你想做个什么小应用或小游戏？（比如：“做一个带舒缓音效的呼吸减压器” 或 “做一个 2048 小游戏”）',
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
    
    // 1. 追加用户消息
    const newMessages = [...messages, { role: 'user', content: userText, html: null }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '生成失败，请重试');

      // 2. 追加 AI 回复与生成的网页预览
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '搞定！已为你生成好应用，可以在下方直接互动：',
          html: data.html
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `出现了一点小问题：${err.message}`,
          html: null
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* 顶部 Header */}
      <header style={styles.header}>
        <div style={styles.avatar}>✦</div>
        <div>
          <h1 style={styles.title}>AI Micro App Studio</h1>
          <p style={styles.status}>● Online & Ready</p>
        </div>
      </header>

      {/* 对话消息区域 */}
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

              {/* 如果该条消息包含生成的 HTML，渲染 Preview iFrame */}
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

        {loading && (
          <div style={{ ...styles.messageWrapper, justifyContent: 'flex-start' }}>
            <div style={{ ...styles.bubble, ...styles.aiBubble }}>
              <p style={styles.msgText}>正在构思并编写代码中，请稍等片刻...</p>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* 底部输入框 */}
      <footer style={styles.inputArea}>
        <div style={styles.inputContainer}>
          <textarea
            style={styles.textarea}
            placeholder="与 AI 交流你的灵感... (Press Enter to send)"
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
            发送 →
          </button>
        </div>
      </footer>
    </div>
  );
}

// 极简黑白对话主题
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
