import { useState, useRef, useEffect } from 'react';

const FAVORITES_KEY = 'sanctuary_favorites';

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
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // 启动时读取本地收藏
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) {
      console.error('Failed to load favorites:', e);
    }
  }, []);

  const persistFavorites = (updated) => {
    setFavorites(updated);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save favorites:', e);
    }
  };

  const isFavorited = (html) => favorites.some(f => f.html === html);

  const toggleFavorite = (msg) => {
    if (!msg.html) return;

    if (isFavorited(msg.html)) {
      persistFavorites(favorites.filter(f => f.html !== msg.html));
      return;
    }

    const newFavorite = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prompt: msg.userPrompt || 'A space made for you',
      html: msg.html,
      createdAt: Date.now()
    };
    persistFavorites([newFavorite, ...favorites]);
  };

  const removeFavorite = (id) => {
    persistFavorites(favorites.filter(f => f.id !== id));
  };

  const openFavoriteInChat = (fav) => {
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `Here's the space you saved 💛`, html: fav.html, userPrompt: fav.prompt }
    ]);
    setShowFavorites(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');

    const history = messages
      .filter(m => m.content)
      .slice(-12)
      .map(m => ({ role: m.role, text: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userText, html: null },
      { role: 'assistant', content: '🌙 Taking a moment for you...', html: null, pending: true }
    ]);
    setLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText, history }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong while creating your space.');
      }

      const { mode, content } = data;

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (mode === 'experience') {
          updated[lastIdx] = {
            role: 'assistant',
            content: 'I made this little space for you 💛',
            html: content,
            userPrompt: userText
          };
        } else {
          updated[lastIdx] = {
            role: 'assistant',
            content: content,
            html: null
          };
        }
        return updated;
      });
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
        <div style={styles.headerLeft}>
          <div style={styles.avatar}>🌸</div>
          <div>
            <h1 style={styles.title}>Sanctuary</h1>
            <p style={styles.status}>A quiet space, made just for how you feel</p>
          </div>
        </div>
        <button
          style={styles.favToggleBtn}
          onClick={() => setShowFavorites(true)}
        >
          ♡ Saved {favorites.length > 0 && `(${favorites.length})`}
        </button>
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
              <p style={styles.msgText}>
                {msg.content}
                {msg.pending && loading && index === messages.length - 1 && (
                  <span style={styles.pulseDot}>●</span>
                )}
              </p>

              {msg.html && (
                <div style={styles.previewCard}>
                  <iframe
                    srcDoc={msg.html}
                    title={`preview-${index}`}
                    style={styles.iframe}
                    sandbox="allow-scripts allow-modals allow-same-origin"
                  />
                  <div style={styles.previewFooter}>
                    <button
                      onClick={() => toggleFavorite(msg)}
                      style={{
                        ...styles.saveBtn,
                        ...(isFavorited(msg.html) ? styles.saveBtnActive : {})
                      }}
                    >
                      {isFavorited(msg.html) ? '♥ Saved' : '♡ Save this space'}
                    </button>
                  </div>
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

      {showFavorites && (
        <div style={styles.drawerOverlay} onClick={() => setShowFavorites(false)}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>Your saved spaces</h2>
              <button style={styles.closeBtn} onClick={() => setShowFavorites(false)}>✕</button>
            </div>

            {favorites.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>
                  Nothing saved yet. When you find a space you love, tap "Save this space" to keep it here.
                </p>
              </div>
            ) : (
              <div style={styles.favoriteList}>
                {favorites.map((fav) => (
                  <div key={fav.id} style={styles.favoriteItem}>
                    <div style={styles.favoritePreview}>
                      <iframe
                        srcDoc={fav.html}
                        title={`fav-${fav.id}`}
                        style={styles.favoriteIframe}
                        sandbox="allow-scripts allow-same-origin"
                      />
                    </div>
                    <div style={styles.favoriteInfo}>
                      <p style={styles.favoritePrompt}>{fav.prompt}</p>
                      <div style={styles.favoriteActions}>
                        <button style={styles.openBtn} onClick={() => openFavoriteInChat(fav)}>
                          Open
                        </button>
                        <button style={styles.removeBtn} onClick={() => removeFavorite(fav.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
    justifyContent: 'space-between',
    padding: '18px 24px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.5)',
    backdropFilter: 'blur(8px)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
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
  favToggleBtn: {
    background: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: '10px',
    padding: '8px 14px',
    fontSize: '13.5px',
    fontWeight: '600',
    color: '#8a5c8f',
    cursor: 'pointer',
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
  pulseDot: {
    marginLeft: '6px',
    fontSize: '10px',
    color: '#c8a2e0',
    animation: 'pulse 1.2s infinite ease-in-out',
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
  previewFooter: {
    padding: '10px 14px',
    borderTop: '1px solid rgba(0,0,0,0.05)',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    background: 'transparent',
    border: '1px solid rgba(200,162,224,0.5)',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#a074b5',
    cursor: 'pointer',
  },
  saveBtnActive: {
    background: 'linear-gradient(135deg, #f5b7c4, #c8a2e0)',
    color: '#ffffff',
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
  },
  drawerOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(60,50,70,0.35)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  drawer: {
    width: '100%',
    maxWidth: '420px',
    height: '100%',
    background: 'linear-gradient(180deg, #fdf6f0 0%, #f3e8ff 100%)',
    boxShadow: '-8px 0 24px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '18px',
  },
  drawerTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#4a3f5c',
    margin: 0,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.7)',
    border: 'none',
    borderRadius: '8px',
    width: '32px',
    height: '32px',
    fontSize: '14px',
    color: '#4a3f5c',
    cursor: 'pointer',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyText: {
    color: '#8a7ea3',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  favoriteList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  favoriteItem: {
    background:
