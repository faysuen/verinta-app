import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey there! I'm your AI Micro-App Assistant. What would you like to build today?",
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

    // Append user message
    setMessages((prev) => [...prev, { role: 'user', content: userText, html: null }]);
    setLoading(true);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userText }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Generation failed.');
      }

      // Stream handling
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullCode = '';

      // Create an initial placeholder message for assistant
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Generating your app...', html: '' }
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullCode += chunk;

        // Clean code blocks on the fly
        let cleanCode = fullCode.trim();
        if (cleanCode.startsWith('```')) {
          cleanCode = cleanCode.replace(/^
