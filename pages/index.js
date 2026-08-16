import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const FAVORITES_KEY = 'sanctuary_favorites';

const EMOTION_CHIPS = [
  { label: '😔 Feeling low', text: "I've been feeling really low today." },
  { label: '😰 Anxious', text: "I feel anxious and can't quite settle down." },
  { label: '🌊 Missing something', text: "I've been missing something, I'm not sure how to explain it." },
  { label: '🌙 Just need quiet', text: "I just want a quiet moment to breathe." },
];

const CRISIS_RESOURCES = [
  { region: 'US & Canada', text: '988 Suicide & Crisis Lifeline — call or text 988' },
  { region: 'US (text option)', text: 'Crisis Text Line — text HOME to 741741' },
  { region: 'UK & Ireland', text: 'Samaritans — call 116 123' },
  { region: 'Elsewhere', text: 'International Association for Suicide Prevention — findahelpline.com' },
];

const DEFAULT_GREETING = "Hi, I'm here with you. 🌿 Tell me how you're feeling right now — even a single word is enough.";

export default function Home() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authStatus, setAuthStatus] = useState(null);
  const [authErrorDetail, setAuthErrorDetail] = useState('');

  const [messages, setMessages] = useState([
    { role: 'assistant', content: DEFAULT_GREETING, html: null }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setShowAuthPanel(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (session) {
      loadFavoritesFromDb();
      buildPersonalizedGreeting();
    } else {
      try {
        const stored = localStorage.getItem(FAVORITES_KEY);
        setFavorites(stored ? JSON.parse(stored) : []);
      } catch (e) {
        console.error('Failed to load local favorites:', e);
      }
      setMessages([{ role: 'assistant', content: DEFAULT_GREETING, html: null }]);
    }
  }, [session, authLoading]);

  const loadFavoritesFromDb = async () => {
    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load favorites from db:', error.message);
      return;
    }
    setFavorites((data || []).map(f => ({ id: f.id, prompt: f.prompt, html: f.html, createdAt: f.created_at })));
  };

  const buildPersonalizedGreeting = async () => {
    const { data, error } = await supabase
      .from('mood_logs')
      .select('content, mood_tag, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      setMessages([{ role: 'assistant', content: DEFAULT_GREETING, html: null }]);
      return;
    }

    const last = data[0];
    const hoursSince = (Date.now() - new Date(last.created_at).getTime()) / (1000 * 60 * 60);

    if (hoursSince >= 12 && last.mood_tag && last.mood_tag !== 'neutral') {
      setMessages([{
        role: 'assistant',
        content: `Welcome back. 🌿 Last time, you mentioned feeling ${last.mood_tag}. How are you doing now?`,
        html: null
      }]);
    } else {
      setMessages([{ role: 'assistant', content: DEFAULT_GREETING, html: null }]);
    }
  };

  const persistLocalFavorites = (updated) => {
    setFavorites(updated);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save local favorites:', e);
    }
  };

  const isFavorited = (html) => favorites.some(f => f.html === html);

  const toggleFavorite = async (msg) => {
    if (!msg.html) return;

    if (isFavorited(msg.html)) {
      const target = favorites.find(f => f.html === msg.html);
      if (session) {
        const { error } = await supabase.from('favorites').delete().eq('id', target.id);
        if (error) { console.error('Failed to remove favorite:', error.message); return; }
        setFavorites(favorites.filter(f => f.id !== target.id));
      } else {
        persistLocalFavorites(favorites.filter(f => f.html !== msg.html));
      }
      return;
    }

    const prompt = msg.userPrompt || 'A space made for you';

    if (session) {
      const { data, error } = await supabase
        .from('favorites')
        .insert({ user_id: session.user.id, prompt, html: msg.html })
        .select()
        .single();
      if (error) { console.error('Failed to save favorite:', error.message); return; }
      setFavorites([{ id: data.id, prompt: data.prompt, html: data.html, createdAt: data.created_at }, ...favorites]);
    } else {
      const newFavorite = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        prompt, html: msg.html, createdAt: Date.now()
      };
      persistLocalFavorites([newFavorite, ...favorites]);
    }
  };

  const removeFavorite = async (id) => {
    if (session) {
      const { error } = await supabase.from('favorites').delete().eq('id', id);
      if (error) { console.error('Failed to remove favorite:', error.message); return; }
      setFavorites(favorites.filter(f => f.id !== id));
    } else {
      persistLocalFavorites(favorites.filter(f => f.id !== id));
    }
  };

  const openFavoriteInChat = (fav) => {
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `Here's the space you saved 💛`, html: fav.html, userPrompt: fav.prompt }
    ]);
    setShowFavorites(false);
  };

  const handleSendMagicLink = async () => {
    if (!authEmail.trim()) return;
    setAuthStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
    });
    if (error) {
      console.error('Magic link error:', error);
      setAuthErrorDetail(error.message || 'Unknown error');
      setAuthStatus('error');
    } else {
      setAuthStatus('sent');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setShowFavorites(false);
  };

  const sendMessage = async (userText) => {
    if (!userText.trim() || loading) return;

    const guestHistory = messages
      .filter(m => m.content && m.mode !== 'support')
      .slice(-12)
      .map(m => ({ role: m.role, text: m.content }));

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userText, html: null },
      { role: 'assistant', content: '', html: null, pending: true }
    ]);
    setLoading(true);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: userText, history: session ? undefined : guestHistory }),
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
          updated[lastIdx] = { role: 'assistant', content: 'I made this little space for you 💛', html: content, userPrompt: userText };
        } else if (mode === 'support') {
          updated[lastIdx] = { role: 'assistant', content, html: null, mode: 'support' };
        } else {
          updated[lastIdx] = { role: 'assistant', content, html: null };
        }
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = { role: 'assistant', content: `I'm sorry, something didn't go as planned: ${err.message}`, html: null };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    sendMessage(text);
  };

  const handleChipClick = (chipText) => {
    if (loading) return;
    sendMessage(chipText);
  };

  const showChips = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div className="sanctuary-root">
      <style>{`
        @keyframes breathe { 0%,100%{transform:scale(0.85);opacity:0.5;} 50%{transform:scale(1.15);opacity:1;} }
        @keyframes breatheOuter { 0%,100%{transform:scale(1);opacity:0.3;} 50%{transform:scale(1.4);opacity:0.6;} }

        * { box-sizing: border-box; }

        .sanctuary-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh; /* 移动端浏览器地址栏收缩时更准确的视口高度 */
          background: linear-gradient(160deg, #fdf6f0 0%, #f3e8ff 50%, #e0f2ff 100%);
          color: #3f3a4b;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
        }

        .sanctuary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          background-color: rgba(255,255,255,0.5);
          backdrop-filter: blur(8px);
          gap: 10px;
          flex-shrink: 0;
        }

        .sanctuary-chatbox {
          flex: 1;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
        }

        .sanctuary-bubble {
          max-width: 85%;
          border-radius: 18px;
          padding: 14px 18px;
          line-height: 1.6;
          font-size: 15px;
        }

        .sanctuary-iframe {
          width: 100%;
          height: 450px;
          border: none;
          display: block;
        }

        .sanctuary-inputarea {
          padding: 18px 24px;
          border-top: 1px solid rgba(0,0,0,0.06);
          background-color: rgba(255,255,255,0.5);
          backdrop-filter: blur(8px);
          flex-shrink: 0;
        }

        .sanctuary-drawer {
          width: 100%;
          max-width: 420px;
          height: 100%;
        }

        .sanctuary-chip {
          padding: 9px 16px;
          font-size: 13.5px;
        }

        .sanctuary-header-title {
          font-size: 17px;
        }

        .sanctuary-header-status {
          font-size: 12.5px;
        }

        .sanctuary-header-btn {
          padding: 8px 14px;
          font-size: 13.5px;
        }

        /* ---- 平板/小屏 ---- */
        @media (max-width: 640px) {
          .sanctuary-header {
            padding: 12px 14px;
          }
          .sanctuary-header-title {
            font-size: 15.5px;
          }
          .sanctuary-header-status {
            display: none; /* 手机上隐藏副标题，给按钮腾空间 */
          }
          .sanctuary-header-btn {
            padding: 7px 10px;
            font-size: 12px;
          }
          .sanctuary-avatar {
            width: 32px !important;
            height: 32px !important;
            font-size: 16px !important;
          }
          .sanctuary-chatbox {
            padding: 14px 12px;
            gap: 14px;
          }
          .sanctuary-bubble {
            max-width: 92%;
            padding: 12px 14px;
            font-size: 14.5px;
          }
          .sanctuary-iframe {
            height: 60vh;
            height: 60dvh;
          }
          .sanctuary-inputarea {
            padding: 10px 12px;
          }
          .sanctuary-chip {
            padding: 8px 12px;
            font-size: 12.5px;
          }
          .sanctuary-drawer {
            max-width: 100%;
          }
        }

        /* ---- 极小屏 ---- */
        @media (max-width: 360px) {
          .sanctuary-header-title {
            font-size: 14px;
          }
          .sanctuary-bubble {
            max-width: 95%;
            font-size: 14px;
          }
        }
      `}</style>

      <header className="sanctuary-header">
        <div style={styles.headerLeft}>
          <div className="sanctuary-avatar" style={styles.avatar}>🌸</div>
          <div>
            <h1 className="sanctuary-header-title" style={styles.title}>Sanctuary</h1>
            <p className="sanctuary-header-status" style={styles.status}>A quiet space, made just for how you feel</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button className="sanctuary-header-btn" style={styles.favToggleBtn} onClick={() => setShowFavorites(true)}>
            ♡ Saved {favorites.length > 0 && `(${favorites.length})`}
          </button>
          {!authLoading && (
            session ? (
              <button className="sanctuary-header-btn" style={styles.authBtn} onClick={handleSignOut}>Sign out</button>
            ) : (
              <button className="sanctuary-header-btn" style={styles.authBtn} onClick={() => setShowAuthPanel(true)}>Remember me</button>
            )
          )}
        </div>
      </header>

      <main className="sanctuary-chatbox">
        {messages.map((msg, index) => (
          <div key={index} style={{ ...styles.messageWrapper, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              className="sanctuary-bubble"
              style={{ ...(msg.role === 'user' ? styles.userBubble : styles.aiBubble), ...(msg.mode === 'support' ? styles.supportBubble : {}) }}
            >
              {msg.pending && loading && index === messages.length - 1 ? (
                <div style={styles.breatheWrap}>
                  <div style={styles.breatheOuter} />
                  <div style={styles.breatheInner} />
                </div>
              ) : (
                <p style={styles.msgText}>{msg.content}</p>
              )}

              {msg.mode === 'support' && (
                <div style={styles.resourceCard}>
                  <p style={styles.resourceTitle}>You don't have to go through this alone</p>
                  {CRISIS_RESOURCES.map((r, i) => (
                    <p key={i} style={styles.resourceLine}><span style={styles.resourceRegion}>{r.region}:</span> {r.text}</p>
                  ))}
                </div>
              )}

              {msg.html && (
                <div style={styles.previewCard}>
                  <iframe
                    className="sanctuary-iframe"
                    srcDoc={msg.html}
                    title={`preview-${index}`}
                    sandbox="allow-scripts allow-modals allow-same-origin"
                  />
                  <div style={styles.previewFooter}>
                    <button onClick={() => toggleFavorite(msg)} style={{ ...styles.saveBtn, ...(isFavorited(msg.html) ? styles.saveBtnActive : {}) }}>
                      {isFavorited(msg.html) ? '♥ Saved' : '♡ Save this space'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {showChips && (
          <div style={styles.chipsRow}>
            {EMOTION_CHIPS.map((chip, i) => (
              <button key={i} className="sanctuary-chip" style={styles.chip} onClick={() => handleChipClick(chip.text)} disabled={loading}>
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      <footer className="sanctuary-inputarea">
        <div style={styles.inputContainer}>
          <textarea
            style={styles.textarea}
            placeholder="How are you feeling right now?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            rows={2}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.4 : 1 }}>
            Share →
          </button>
        </div>
      </footer>

      {showFavorites && (
        <div style={styles.drawerOverlay} onClick={() => setShowFavorites(false)}>
          <div className="sanctuary-drawer" style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>Your saved spaces</h2>
              <button style={styles.closeBtn} onClick={() => setShowFavorites(false)}>✕</button>
            </div>

            {!session && (
              <div style={styles.guestNotice}>
                Saved locally on this device only. <button style={styles.inlineLink} onClick={() => { setShowFavorites(false); setShowAuthPanel(true); }}>Sign in</button> to keep them across devices.
              </div>
            )}

            {favorites.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={styles.emptyText}>Nothing saved yet. When you find a space you love, tap "Save this space" to keep it here.</p>
              </div>
            ) : (
              <div style={styles.favoriteList}>
                {favorites.map((fav) => (
                  <div key={fav.id} style={styles.favoriteItem}>
                    <div style={styles.favoritePreview}>
                      <iframe srcDoc={fav.html} title={`fav-${fav.id}`} style={styles.favoriteIframe} sandbox="allow-scripts allow-same-origin" />
                    </div>
                    <div style={styles.favoriteInfo}>
                      <p style={styles.favoritePrompt}>{fav.prompt}</p>
                      <div style={styles.favoriteActions}>
                        <button style={styles.openBtn} onClick={() => openFavoriteInChat(fav)}>Open</button>
                        <button style={styles.removeBtn} onClick={() => removeFavorite(fav.id)}>Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showAuthPanel && (
        <div style={styles.drawerOverlay} onClick={() => setShowAuthPanel(false)}>
          <div className="sanctuary-drawer" style={styles.authPanel} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>Remember me</h2>
              <button style={styles.closeBtn} onClick={() => setShowAuthPanel(false)}>✕</button>
            </div>
            <p style={styles.authDesc}>
              Sign in and Sanctuary will remember how you've been feeling, keep your saved spaces synced across devices, and greet you like it remembers you.
            </p>
            {authStatus === 'sent' ? (
              <p style={styles.authSentMsg}>Check your email — we sent you a sign-in link. 💛</p>
            ) : (
              <>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  style={styles.authInput}
                />
                <button style={styles.authSendBtn} onClick={handleSendMagicLink} disabled={authStatus === 'sending' || !authEmail.trim()}>
                  {authStatus === 'sending' ? 'Sending...' : 'Send me a sign-in link'}
                </button>
                {authStatus === 'error' && <p style={styles.authErrorMsg}>{authErrorDetail || 'Something went wrong — please try again.'}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  headerLeft: { display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 },
  title: { fontWeight: '600', margin: 0, color: '#4a3f5c', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  status: { color: '#8a7ea3', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  favToggleBtn: { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '10px', fontWeight: '600', color: '#8a5c8f', cursor: 'pointer', whiteSpace: 'nowrap' },
  authBtn: { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '10px', fontWeight: '600', color: '#8a5c8f', cursor: 'pointer', whiteSpace: 'nowrap' },
  messageWrapper: { display: 'flex', width: '100%' },
  userBubble: { backgroundColor: '#ffffff', color: '#4a3f5c', borderBottomRightRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  aiBubble: { backgroundColor: 'rgba(255,255,255,0.65)', color: '#4a3f5c', border: '1px solid rgba(255,255,255,0.8)', borderBottomLeftRadius: '4px', width: '100%', backdropFilter: 'blur(6px)' },
  supportBubble: { border: '1px solid rgba(232,117,154,0.35)', background: 'rgba(255,247,249,0.85)' },
  msgText: { margin: 0, whiteSpace: 'pre-wrap' },
  breatheWrap: { position: 'relative', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0' },
  breatheOuter: { position: 'absolute', width: '40px', height: '40px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(200,162,224,0.5), transparent 70%)', animation: 'breatheOuter 2.4s ease-in-out infinite' },
  breatheInner: { position: 'absolute', width: '18px', height: '18px', borderRadius: '50%', background: 'linear-gradient(135deg, #e8759a, #9d5fc7)', animation: 'breathe 2.4s ease-in-out infinite' },
  resourceCard: { marginTop: '12px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(232,117,154,0.25)' },
  resourceTitle: { margin: '0 0 8px 0', fontSize: '13.5px', fontWeight: '600', color: '#8a4f6a' },
  resourceLine: { margin: '4px 0', fontSize: '13px', color: '#5c4f66', lineHeight: '1.5' },
  resourceRegion: { fontWeight: '600' },
  chipsRow: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' },
  chip: { background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '20px', color: '#4a3f5c', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' },
  previewCard: { marginTop: '14px', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)', backgroundColor: '#ffffff', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
  previewFooter: { padding: '10px 14px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'flex-end' },
  saveBtn: { background: 'transparent', border: '1px solid rgba(157,95,199,0.5)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: '600', color: '#8a4fb0', cursor: 'pointer' },
  saveBtnActive: { background: 'linear-gradient(135deg, #e8759a, #9d5fc7)', color: '#ffffff', border: 'none', boxShadow: '0 2px 8px rgba(157,95,199,0.35)' },
  inputContainer: { maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '16px', padding: '10px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  textarea: { flex: 1, minWidth: 0, backgroundColor: 'transparent', border: 'none', outline: 'none', color: '#4a3f5c', fontSize: '15px', resize: 'none', fontFamily: 'inherit' },
  sendBtn: { flexShrink: 0, background: 'linear-gradient(135deg, #e8759a, #9d5fc7)', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '9px 16px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(157,95,199,0.35)' },
  drawerOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(60,50,70,0.35)', backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 },
  drawer: { background: 'linear-gradient(180deg, #fdf6f0 0%, #f3e8ff 100%)', boxShadow: '-8px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box', overflowY: 'auto' },
  drawerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' },
  drawerTitle: { fontSize: '18px', fontWeight: '600', color: '#4a3f5c', margin: 0 },
  closeBtn: { background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', fontSize: '14px', color: '#4a3f5c', cursor: 'pointer', flexShrink: 0 },
  emptyState: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' },
  emptyText: { color: '#8a7ea3', fontSize: '14px', lineHeight: '1.6' },
  guestNotice: { fontSize: '12.5px', color: '#8a7ea3', background: 'rgba(255,255,255,0.5)', padding: '10px 12px', borderRadius: '10px', marginBottom: '14px', lineHeight: '1.5' },
  inlineLink: { background: 'none', border: 'none', color: '#9d5fc7', fontWeight: '600', cursor: 'pointer', padding: 0, fontSize: '12.5px', textDecoration: 'underline' },
  favoriteList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  favoriteItem: { background: 'rgba(255,255,255,0.6)', borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.8)' },
  favoritePreview: { height: '160px', overflow: 'hidden', borderBottom: '1px solid rgba(0,0,0,0.05)' },
  favoriteIframe: { width: '100%', height: '100%', border: 'none', pointerEvents: 'none' },
  favoriteInfo: { padding: '12px 14px' },
  favoritePrompt: { fontSize: '13.5px', color: '#4a3f5c', margin: '0 0 10px 0', lineHeight: '1.4' },
  favoriteActions: { display: 'flex', gap: '8px' },
  openBtn: { flex: 1, background: 'linear-gradient(135deg, #e8759a, #9d5fc7)', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '7px 0', fontSize: '13px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 8px rgba(157,95,199,0.35)' },
  removeBtn: { background: 'transparent', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', color: '#8a7ea3', cursor: 'pointer' },
  authPanel: { background: 'linear-gradient(180deg, #fdf6f0 0%, #f3e8ff 100%)', boxShadow: '-8px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' },
  authDesc: { fontSize: '13.5px', color: '#8a7ea3', lineHeight: '1.6', marginBottom: '18px' },
  authInput: { width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '16px', marginBottom: '12px', boxSizing: 'border-box', outline: 'none' },
  authSendBtn: { width: '100%', background: 'linear-gradient(135deg, #e8759a, #9d5fc7)', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '11px 0', fontWeight: '600', fontSize: '14px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(157,95,199,0.35)' },
  authSentMsg: { fontSize: '14px', color: '#4a3f5c', lineHeight: '1.6', background: 'rgba(255,255,255,0.6)', padding: '14px', borderRadius: '10px' },
  authErrorMsg: { fontSize: '13px', color: '#c14f5c', marginTop: '10px' },
};
