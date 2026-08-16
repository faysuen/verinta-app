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
