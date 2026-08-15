import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [iframeSrc, setIframeSrc] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);

  const handleGenerate = async (customPrompt) => {
    const textToUse = customPrompt || prompt;
    if (!textToUse.trim()) return;

    setLoading(true);
    setHasGenerated(true);
    setIframeSrc(''); // Clear previous app

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToUse })
      });
      const data = await res.json();

      if (data.html) {
        const blob = new Blob([data.html], { type: 'text/html' });
        setIframeSrc(URL.createObjectURL(blob));
      } else {
        alert(data.error || 'Generation failed');
        setHasGenerated(false);
      }
    } catch (err) {
      alert('Something went wrong. Please try again.');
      setHasGenerated(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Verinta.ai | Turn a sentence into an instant interactive micro-app</title>
      </Head>
    
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4 md:p-8 font-sans">
        
        {/* Header */}
        <header className="max-w-2xl text-center my-8 space-y-3">
          <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-indigo-500">
            Verinta.ai
          </h1>
          <p className="text-slate-400 text-sm md:text-base tracking-wide">
            Turn a single sentence into an instant interactive micro-app
          </p>
        </header>

        {/* Main Input Area */}
        <main className="w-full max-w-3xl space-y-6">
          <div className="relative flex items-center">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="e.g. Stressed at work, need bubble wrap / Help me pick lunch..."
              className="w-full px-6 py-4 pr-24 text-base md:text-lg rounded-2xl bg-slate-900 border border-slate-800 focus:outline-none focus:border-purple-500 text-slate-100 shadow-2xl transition placeholder-slate-500"
            />
            <button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="absolute right-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium px-5 py-2.5 rounded-xl transition shadow-md disabled:opacity-50"
            >
              {loading ? 'Building...' : 'Create ✨'}
            </button>
          </div>

          {/* Prompt Chips */}
          <div className="flex flex-wrap gap-2 justify-center text-xs text-slate-400">
            <span className="text-slate-500">Try these:</span>
            <button onClick={() => handleGenerate('Pop infinite bubble wrap to relieve stress')} className="bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-800 transition">🫧 Bubble Wrap</button>
            <button onClick={() => handleGenerate('Spin the wheel to decide what to eat for dinner')} className="bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-800 transition">🍕 Dinner Wheel</button>
            <button onClick={() => handleGenerate('Cyber Zen Woodblock for instant good karma')} className="bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-800 transition">🪵 Zen Clicker</button>
          </div>

          {/* Render Sandbox Area */}
          <div className="relative w-full h-[520px] bg-slate-900/60 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl flex items-center justify-center">
            {!hasGenerated && !loading && (
              <div className="text-center space-y-3 p-6 text-slate-500">
                <div className="text-5xl">🪄</div>
                <p className="text-sm">Type a prompt above to bring your instant micro-app to life</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center space-y-4 p-6 text-center">
                <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                <p className="text-purple-400 text-sm font-medium animate-pulse">Verinta is building your unique app in real-time...</p>
              </div>
            )}

            {iframeSrc && !loading && (
              <iframe
                src={iframeSrc}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
              />
            )}
          </div>
        </main>
      </div>
    </>
  );
}
