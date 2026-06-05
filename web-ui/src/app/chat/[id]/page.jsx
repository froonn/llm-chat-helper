'use client';

import React, {useState, useRef, useEffect} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// Преобразование одиночных переводов строк в двойные
const addDoubleLineBreaks = (text) => text.replace(/\n/g, '\n\n');

export default function ChatPage({params}) {
    const resolvedParams = React.use(params);
    const {id} = resolvedParams;

    const [allMessages, setAllMessages] = useState([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(true);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState(null);

    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const autoStartHandledRef = useRef(false);

    // Загружаем сообщения из localStorage
    useEffect(() => {
        if (!id) return;
        const stored = localStorage.getItem(`messages_${id}`);
        if (stored) {
            setAllMessages(JSON.parse(stored));
        } else {
            setAllMessages([]);
        }
        setIsLoadingMessages(false);
    }, [id]);

    // Сохраняем сообщения при изменении
    useEffect(() => {
        if (!id || isLoadingMessages) return;
        localStorage.setItem(`messages_${id}`, JSON.stringify(allMessages));
    }, [allMessages, id, isLoadingMessages]);

    // Автоскролл
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [allMessages, isLoading]);

    const sendMessage = async (messageText = input) => {
        if (!messageText.trim() || isLoading) return;
        setError(null);

        const fromInput = messageText === input;
        const userMsg = {id: Date.now(), text: messageText, sender: 'user'};
        const botPlaceholder = {id: Date.now() + 1, text: '', sender: 'bot'};

        setAllMessages(prev => [...prev, userMsg, botPlaceholder]);
        if (fromInput) {
            setInput('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }

        setIsLoading(true);
        setIsThinking(true);

        // подготовим историю для отправки (включая только sender/text)
        const history = [...allMessages, userMsg].map(m => ({sender: m.sender, text: m.text}));

        // Получаем backend chat_id
        const backendChatId = localStorage.getItem(`chat_id_${id}`) || id;

        // Содержимое тела запроса
        const body = {chat_id: backendChatId, message: messageText, history};

        // Функция для обновления текста бота в состоянии
        const appendToBot = (text, markThinkingDone = true) => {
            if (!text) return;
            if (markThinkingDone && text.trim()) setIsThinking(false);
            setAllMessages(prev => prev.map(m => m.id === botPlaceholder.id ? {...m, text: m.text + text} : m));
        };

        try {
            // Сначала попробуем стриминг-эндпоинт
            const streamResp = await fetch(`${API_BASE}/api/v1/chat/stream`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            });

            if (streamResp.ok && streamResp.body) {
                const reader = streamResp.body.getReader();
                const decoder = new TextDecoder();
                let done = false;
                let buffered = '';
                let backendIdSet = backendChatId;
                let metaParsed = false;
                let answerStarted = false;

                // показываем thinking до прихода первых данных (уже показано placeholder)

                while (!done) {
                    const {value, done: readDone} = await reader.read();
                    done = readDone;
                    if (value) {
                        buffered += decoder.decode(value, {stream: true});

                        while (buffered) {
                            if (!metaParsed) {
                                const newlineIndex = buffered.indexOf('\n');
                                if (newlineIndex === -1) break;

                                const firstLine = buffered.slice(0, newlineIndex).trim();
                                if (firstLine.startsWith('{')) {
                                    try {
                                        const meta = JSON.parse(firstLine);
                                        if (meta.chat_id) {
                                            backendIdSet = meta.chat_id;
                                            localStorage.setItem(`chat_id_${id}`, backendIdSet);
                                        }
                                        buffered = buffered.slice(newlineIndex + 1);
                                        metaParsed = true;
                                        continue;
                                    } catch (e) {
                                        // если первая строка не является JSON meta, считаем её частью ответа
                                    }
                                }

                                metaParsed = true;
                            }

                            if (buffered) {
                                if (!answerStarted && buffered.trim()) {
                                    answerStarted = true;
                                    setIsThinking(false);
                                }
                                appendToBot(buffered, false);
                                buffered = '';
                            }
                            break;
                        }
                    }
                }

                if (buffered) {
                    if (!answerStarted && buffered.trim()) {
                        setIsThinking(false);
                    }
                    appendToBot(buffered, false);
                }

                // стрим закончился — всё ок
            } else {
                // Фоллбек: обычный синхронный запрос к /api/v1/chat/
                const resp = await fetch(`${API_BASE}/api/v1/chat/`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(body),
                });
                if (!resp.ok) {
                    console.error(`Ошибка ${resp.status}`);
                    setError('Не удалось отправить сообщение. Проверьте соединение с сервером.');
                    setAllMessages(prev => prev.filter(m => m.id !== userMsg.id && m.id !== botPlaceholder.id));
                    return;
                }
                const data = await resp.json();
                if (data.chat_id && data.chat_id !== backendChatId) {
                    localStorage.setItem(`chat_id_${id}`, data.chat_id);
                }
                const answer = data.answer || '';
                setIsThinking(false);
                appendToBot(answer);
            }
        } catch (err) {
            console.error('Send message error:', err);
            setError('Не удалось отправить сообщение. Проверьте соединение с сервером.');
            // Удаляем последнее сообщение пользователя и placeholder бота, так как отправка не удалась
            setAllMessages(prev => prev.filter(m => m.id !== userMsg.id && m.id !== botPlaceholder.id));
        } finally {
            setIsLoading(false);
            setIsThinking(false);
        }
    };

    useEffect(() => {
        if (!id || isLoadingMessages || autoStartHandledRef.current) return;

        const pendingFirstMessage = localStorage.getItem(`pending_first_message_${id}`);
        if (!pendingFirstMessage) return;
        if (allMessages.length > 0) return;

        autoStartHandledRef.current = true;
        localStorage.removeItem(`pending_first_message_${id}`);
        sendMessage(pendingFirstMessage);
    }, [id, isLoadingMessages, allMessages.length, sendMessage]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleInput = (e) => {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.25) + 'px';
        setInput(el.value);
    };

    if (!id || isLoadingMessages) {
        return <div style={styles.loading}>Загрузка чата...</div>;
    }

    return (
        <div style={styles.wrapper}>
            <div style={styles.msgContainer}>
                {allMessages.map(m => {
                    // Если текста нет (пустая заглушка бота), ничего не рендерим
                    if (!m.text || m.text.trim() === '') return null;

                    return (
                        <div
                            key={m.id}
                            style={{
                                ...styles.bubble,
                                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                                backgroundColor: m.sender === 'user' ? '#0b93f6' : '#444654'
                            }}
                        >
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {addDoubleLineBreaks(m.text)}
                            </ReactMarkdown>
                        </div>
                    );
                })}

                {/* Анимация Thinking отображается только когда бот "думает" и текста еще нет */}
                {isThinking && (
                    <div style={{...styles.bubble, alignSelf: 'flex-start', backgroundColor: '#444654'}}>
                        <div className="thinking-dots">
                            <span>●</span><span>●</span><span>●</span>
                            <span style={{marginLeft: '8px'}}>Thinking</span>
                        </div>
                    </div>
                )}

                {error && (
                    <div style={{...styles.errorBubble, alignSelf: 'center'}}>
                        {error}
                    </div>
                )}
                <div ref={messagesEndRef}/>
            </div>

            <div style={styles.form}>
            <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Введите сообщение..."
                style={styles.input}
                disabled={isLoading}
            />
            </div>
        </div>
    );
}

// Компоненты для Markdown (без изменений)
const markdownComponents = {
    code({inline, children, ...props}) {
        return inline ? (
            <code style={styles.inlineCode} {...props}>{children}</code>
        ) : (
            <pre style={styles.pre}><code style={styles.codeBlock} {...props}>{children}</code></pre>
        );
    },
    a({href, children}) {
        return <a href={href} target="_blank" rel="noopener noreferrer" style={styles.link}>{children}</a>;
    },
};

const styles = {
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'white',
        overflow: 'hidden'
    },
    msgContainer: {
        flex: 1,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        overflowY: 'auto',
        overflowX: 'hidden'
    },
    bubble: {
        padding: '12px 18px',
        borderRadius: '15px',
        maxWidth: '90%',
        width: 'fit-content',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere'
    },
    errorBubble: {
        padding: '10px 15px',
        borderRadius: '10px',
        backgroundColor: '#ff4444',
        color: 'white',
        fontSize: '14px',
        maxWidth: '80%',
        textAlign: 'center'
    },
    form: {
        padding: '10px 15px 15px 15px',
        backgroundColor: '#40414f',
        borderTop: '1px solid #555',
        flexShrink: 0
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
        minHeight: '40px',
        padding: '12px',
        borderRadius: '12px',
        border: 'none',
        backgroundColor: '#4d4d4f',
        color: 'white',
        outline: 'none',
        fontSize: '14px',
        lineHeight: '1.4'
    },
    inlineCode: {
        backgroundColor: '#2d2d2d',
        padding: '2px 4px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '0.9em'
    },
    pre: {
        backgroundColor: '#2d2d2d',
        padding: '10px',
        borderRadius: '8px',
        overflowX: 'auto'
    },
    codeBlock: {
        fontFamily: 'monospace',
        fontSize: '0.9em'
    },
    link: {
        color: '#0b93f6',
        textDecoration: 'underline'
    },
    loading: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        color: 'white',
        fontSize: '18px'
    }
};

// Анимация для точек (добавляется один раз)
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