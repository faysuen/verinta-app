import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');
      setHtmlCode(data.html);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>MICRO APP BUILDER</h1>
        <p style={styles.subtitle}>输入提示词，极速生成单文件微应用/小游戏</p>
      </header>

      <main style={styles.main}>
        {/* 输入框区域：支持多行输入与自动增高 */}
        <div style={styles.inputCard}>
          <textarea
            style={styles.textarea}
            placeholder="描述你想做的应用（例如：做一个带有计时器和记分板的 2048 小游戏...）"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
          />
          <div style={styles.actionBar}>
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              style={{
                ...styles.button,
                opacity: loading || !prompt.trim() ? 0.5 : 1,
                cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'BUILDING...' : 'CREATE APP →'}
            </button>
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* 预览区域 */}
        {htmlCode && (
          <div style={styles.previewContainer}>
            <div style={styles.previewHeader}>
              <span style={styles.previewTitle}>LIVE PREVIEW</span>
              <button
                onClick={() => setHtmlCode('')}
                style={styles.clearBtn}
              >
                CLEAR
              </button>
            </div>
            <iframe
              srcDoc={htmlCode}
              title="Preview"
              style={styles.iframe}
              sandbox="allow-scripts allow-modals allow-same-origin"
            />
          </div>
        )}
      </main>
    </div>
  );
}

// 高级黑白主题 (Pure Black & White Minimalist Style)
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#000000',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
    padding: '40px 20px',
    boxSizing: 'border-box',
  },
  header: {
    maxWidth: '800px',
    margin: '0 auto 30px auto',
    textAlign: 'center',
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    letterSpacing: '2px',
    margin: '0 0 10px 0',
  },
  subtitle: {
    color: '#888888',
    fontSize: '14px',
    margin: 0,
  },
  main: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  inputCard: {
    backgroundColor: '#0d0d0d',
    border: '1px solid #262626',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
  },
  textarea: {
    width: '100%',
    backgroundColor: 'transparent',
    color: '#ffffff',
    border: 'none',
    outline: 'none',
    fontSize: '16px',
    lineHeight: '1.6',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #1a1a1a',
  },
  button: {
    backgroundColor: '#ffffff',
    color: '#000000',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    transition: 'all 0.2s ease',
  },
  errorBox: {
    backgroundColor: '#1a0000',
    border: '1px solid #440000',
    color: '#ff5555',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  previewContainer: {
    border: '1px solid #262626',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#0d0d0d',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#141414',
    borderBottom: '1px solid #262626',
  },
  previewTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#888888',
    letterSpacing: '1px',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: '#666666',
    fontSize: '12px',
    cursor: 'pointer',
  },
  iframe: {
    width: '100%',
    height: '550px',
    border: 'none',
    backgroundColor: '#ffffff', // 预览内容框默认纯白背景，便于呈现AI生成的应用
  }
};
