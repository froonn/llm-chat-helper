'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatContext } from '@/contexts/ChatContext';

export default function HomePage() {
  const { createChatWithFirstMessage } = useChatContext();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef(null);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    const userMessage = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const newChatId = createChatWithFirstMessage(userMessage);
    setIsLoading(false);
    router.push(`/chat/${newChatId}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.25) + 'px';
    setInput(el.value);
  };

  return (
    <div style={styles.wrapper}>
      <div>
        <h1 style={styles.title}>Добро пожаловать</h1>
        <p style={styles.subtitle}>Напишите свой вопрос</p>
      </div>

      <div style={styles.inputContainer}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение..."
          style={styles.input}
          disabled={isLoading}
        />
        {isLoading && (
          <div className="thinking-dots" style={styles.thinking}>
            <span>●</span><span>●</span><span>●</span>
            <span style={{ marginLeft: '8px' }}>Thinking</span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: 'white',
    textAlign: 'center',
    gap: '40px',
    padding: '20px',
  },
  title: {
    fontSize: '40px',
    marginBottom: '10px',
  },
  subtitle: {
    fontSize: '25px',
    color: '#aaa',
  },
  inputContainer: {
    width: '100%',
    maxWidth: '700px',
    marginTop: '20px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'none',
    overflowY: 'auto',
    overflowX: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    maxHeight: '25vh',
    minHeight: '60px',
    padding: '14px',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: '#4d4d4f',
    color: 'white',
    outline: 'none',
    fontSize: '16px',
    lineHeight: '1.4',
    fontFamily: 'inherit',
  },
  thinking: {
    marginTop: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    fontSize: '14px',
    color: '#aaa',
  }
};

// Анимация (если ещё не добавлена)
if (typeof document !== 'undefined' && !document.getElementById('thinking-animation')) {
  const style = document.createElement('style');
  style.id = 'thinking-animation';
  style.textContent = `
    @keyframes pulse {
      0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
      30% { opacity: 1; transform: scale(1.2); }
    }
    .thinking-dots span {
      animation: pulse 1.4s infinite;
      display: inline-block;
    }
    .thinking-dots span:nth-child(1) { animation-delay: 0s; }
    .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
  `;
  document.head.appendChild(style);
}