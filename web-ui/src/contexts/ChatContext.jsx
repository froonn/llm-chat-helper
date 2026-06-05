'use client';

import { createContext, useContext } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const ChatContext = createContext();
const MAX_NAME_LEN = 20;
const API_BASE_URL = 'http://localhost:8001'; // Вынесли базу URL для удобства

export function ChatProvider({ children }) {
  const [chats, setChats] = useLocalStorage('chats_list', [
    { id: '1', name: 'Общий чат', pinned: false },
  ]);

  const togglePin = (id) => {
    setChats(chats.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  // Делаем функцию асинхронной
  const deleteChat = async (id, router) => {
    if (!window.confirm('Удалить этот чат? Восстановление невозможно.')) return false;

    try {
      // 1. Сначала запрос к серверу
      const response = await fetch(`${API_BASE_URL}/api/v1/chat/history/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Server error: Failed to delete chat history');
      }

      // 2. Если сервер ответил успешно, удаляем локально
      const newChats = chats.filter(c => c.id !== id);
      setChats(newChats);

      // Очистка localStorage
      localStorage.removeItem(`messages_${id}`);
      localStorage.removeItem(`pending_first_message_${id}`);
      localStorage.removeItem(`chat_id_${id}`);

      // Навигация
      if (router && window.location.pathname === `/chat/${id}`) {
        router.push('/');
      }

      return true;
    } catch (error) {
      console.error('Ошибка при удалении чата:', error);
      alert('Не удалось удалить чат на сервере. Проверьте соединение.');
      return false;
    }
  };

  const renameChat = (id, newName) => {
    if (newName.trim()) {
      const trimmed = newName.trim().slice(0, MAX_NAME_LEN);
      setChats(chats.map(c => c.id === id ? { ...c, name: trimmed } : c));
    }
  };

  const createEmptyChat = () => {
    const newId = Date.now().toString();
    const baseName = `Новый чат ${chats.length + 1}`;
    const name = baseName.length > MAX_NAME_LEN ? baseName.slice(0, MAX_NAME_LEN) : baseName;
    const newChat = { id: newId, name, pinned: false };
    setChats([...chats, newChat]);
    return newId;
  };

  const createChatWithFirstMessage = (userMessage) => {
    const localId = Date.now().toString();
    const baseName = `Новый чат ${chats.length + 1}`;
    const name = baseName.length > MAX_NAME_LEN ? baseName.slice(0, MAX_NAME_LEN) : baseName;

    const newChat = { id: localId, name, pinned: false };
    setChats(prev => [...prev, newChat]);

    localStorage.setItem(`pending_first_message_${localId}`, userMessage);
    localStorage.setItem(`chat_id_${localId}`, localId);
    localStorage.setItem(`messages_${localId}`, JSON.stringify([]));

    return localId;
  };

  const sortedChats = [...chats].sort((a, b) => {
    if (a.pinned === b.pinned) return 0;
    return a.pinned ? -1 : 1;
  });

  return (
    <ChatContext.Provider
      value={{
        chats: sortedChats,
        rawChats: chats,
        togglePin,
        deleteChat, // Теперь это Promise
        renameChat,
        createEmptyChat,
        createChatWithFirstMessage,
        setChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  return useContext(ChatContext);
}