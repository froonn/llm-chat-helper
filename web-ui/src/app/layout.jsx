'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChatProvider, useChatContext } from '@/contexts/ChatContext';

// SVG Иконки
const Icons = {
  Share: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2v6"/><path d="M22 2l-7 7"/><path d="M11 5.513c-6.848.428-10 4.14-10 10.487 0 6.347 4.152 7.07 10 7.07 4.603 0 8.005-.333 10-2"/></svg>,
  Rename: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Pin: () => <svg width="16" height="16"><text x="0" y="14">📌</text></svg>,
  Delete: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
};

// PortalMenu
const PortalMenu = ({ chat, onStartRename, onDeleteChat, onTogglePin, onClose, coords }) => {
  if (!coords) return null;

  const style = {
    ...styles.dropdown,
    top: `${coords.y}px`,
    left: `${coords.x}px`,
  };

  return ReactDOM.createPortal(
    <div style={style} onClick={(e) => e.stopPropagation()}>
      {/*<div style={styles.dropItem}><Icons.Share /> Поделиться</div>*/}
      <div onClick={() => { onStartRename(chat); onClose(); }} style={styles.dropItem}>
        <Icons.Rename /> Переименовать
      </div>
      <div onClick={() => { onTogglePin(chat.id); onClose(); }} style={styles.dropItem}>
        <Icons.Pin /> {chat.pinned ? 'Открепить' : 'Закрепить'}
      </div>
      <div style={styles.divider} />
      <div onClick={() => { onDeleteChat(chat.id); onClose(); }} style={{ ...styles.dropItem, ...styles.deleteItem }}>
        <Icons.Delete /> Удалить
      </div>
    </div>,
    document.body
  );
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          /* Кастомный скроллбар WebKit (Chrome, Edge, Safari) */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #2d2d2d;
            border-radius: 4px;
          }
          ::-webkit-scrollbar-thumb {
            background: #565869;
            border-radius: 4px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #6e7080;
          }
          /* Для Firefox */
          * {
            scrollbar-width: thin;
            scrollbar-color: #565869 #2d2d2d;
          }
        `}} />
      </head>
      <body style={styles.body}>
        <ChatProvider>
          <LayoutContent>{children}</LayoutContent>
        </ChatProvider>
      </body>
    </html>
  );
}

function LayoutContent({ children }) {
  const { chats, togglePin, deleteChat, renameChat, createEmptyChat } = useChatContext();
  const [menuOpenChat, setMenuOpenChat] = useState(null);
  const [menuCoords, setMenuCoords] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [tempName, setTempName] = useState('');

  const router = useRouter();
  const params = useParams();
  const sidebarRef = useRef(null);

  const createNewChat = () => {
    const newId = createEmptyChat();
    router.push(`/chat/${newId}`);
  };

  const startRename = (chat) => {
    setEditingId(chat.id);
    setTempName(chat.name);
  };

  const saveRename = (id) => {
    if (tempName.trim()) {
      const trimmed = tempName.trim().slice(0, 20);
      renameChat(id, trimmed);
    }
    setEditingId(null);
  };

  const handleThreeDotsClick = (e, chat) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 280;
    const windowHeight = window.innerHeight;
    let dropdownY = rect.top;
    const dropdownX = 260 + 5;

    if (rect.top + menuHeight > windowHeight) {
      dropdownY = rect.bottom - menuHeight;
    }
    if (dropdownY < 10) dropdownY = 10;

    setMenuOpenChat(chat);
    setMenuCoords({ x: dropdownX, y: dropdownY });
  };

  useEffect(() => {
    const closeMenu = () => {
      setMenuOpenChat(null);
      setMenuCoords(null);
    };
    if (menuOpenChat) {
      window.addEventListener('click', closeMenu);
      sidebarRef.current?.addEventListener('scroll', closeMenu);
    }
    return () => {
      window.removeEventListener('click', closeMenu);
      sidebarRef.current?.removeEventListener('scroll', closeMenu);
    };
  }, [menuOpenChat]);

  const handleDeleteChat = (id) => {
    deleteChat(id, router);
  };

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar} ref={sidebarRef}>
        <button onClick={createNewChat} style={styles.addBtn}>+ Новый чат</button>
        <nav style={styles.nav}>
          {chats.map(chat => (
            <div key={chat.id} style={{
              ...styles.navItem,
              backgroundColor: params?.id === chat.id ? '#3e3f4b' : 'transparent',
            }}>
              {editingId === chat.id ? (
                <input
                  autoFocus
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value.slice(0, 20))}
                  onKeyDown={(e) => e.key === 'Enter' && saveRename(chat.id)}
                  onBlur={() => saveRename(chat.id)}
                  style={styles.renameInput}
                  maxLength={20}
                />
              ) : (
                <>
                  <Link href={`/chat/${chat.id}`} style={styles.link}>
                    {chat.name.length > 20 ? chat.name.slice(0, 20) + '…' : chat.name} {chat.pinned && '📌'}
                  </Link>
                  <button
                    onClick={(e) => handleThreeDotsClick(e, chat)}
                    style={styles.threeDots}
                  >
                    ⋮
                  </button>
                </>
              )}
            </div>
          ))}
        </nav>
      </aside>
      <main style={styles.main}>{children}</main>

      {menuOpenChat && (
        <PortalMenu
          chat={menuOpenChat}
          onStartRename={startRename}
          onDeleteChat={handleDeleteChat}
          onTogglePin={togglePin}
          onClose={() => { setMenuOpenChat(null); setMenuCoords(null); }}
          coords={menuCoords}
        />
      )}
    </div>
  );
}

const styles = {
  body: { margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#343541' },
  container: { display: 'flex', height: '100vh' },
  sidebar: { width: '260px', backgroundColor: '#202123', color: 'white', padding: '10px', display: 'flex', flexDirection: 'column', position: 'relative' },
  addBtn: { width: '100%', padding: '12px', border: '1px solid #4d4d4f', backgroundColor: 'transparent', color: 'white', borderRadius: '5px', cursor: 'pointer', marginBottom: '15px', textAlign: 'left', transition: '0.2s', fontSize: '14px' },
  nav: { display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto', flex: 1, paddingRight: '2px' },
  navItem: { display: 'flex', alignItems: 'center', padding: '10px 10px 10px 15px', borderRadius: '5px', cursor: 'pointer' },
  link: { color: '#ececf1', textDecoration: 'none', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '14px', marginRight: '5px' },
  renameInput: { background: '#40414f', border: '1px solid #565869', color: 'white', padding: '5px', borderRadius: '3px', width: '100%', outline: 'none' },
  threeDots: { background: 'none', border: 'none', color: '#8e8ea0', cursor: 'pointer', fontSize: '18px', padding: '0 5px' },
  dropdown: {
    position: 'fixed',
    zIndex: 99999,
    backgroundColor: '#202123',
    border: '1px solid #4d4d4f',
    borderRadius: '8px',
    minWidth: '220px',
    padding: '5px',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -2px rgba(0,0,0,0.2)'
  },
  dropItem: { padding: '10px 15px', fontSize: '14px', cursor: 'pointer', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px', color: '#ececf1' },
  divider: { height: '1px', backgroundColor: '#4d4d4f', margin: '5px 0' },
  deleteItem: { color: '#ff4d4d' },
  main: { flex: 1, display: 'flex', flexDirection: 'column' }
};