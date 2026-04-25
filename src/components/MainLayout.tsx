import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink, Play, Settings as SettingsIcon } from 'lucide-react';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import ProfileSetup from './ProfileSetup';
import InAppNotification from './InAppNotification';
import SponsoredVideoView from './SponsoredVideoView';
import { db } from '../lib/firebase';
import { useChat } from '../contexts/ChatContext';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function MainLayout() {
  const { user, profile, appConfig, lastNotification, setLastNotification, setCurrentChatId } = useChat();
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Sync currentChatId to context
  useEffect(() => {
    setCurrentChatId(selectedChat?.id || null);
  }, [selectedChat, setCurrentChatId]);

  // Mobile responsiveness
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        if (selectedChat) {
          setShowSidebar(false);
        } else {
          setShowSidebar(true);
        }
      } else {
        setShowSidebar(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedChat]);

  return (
    <div className="flex flex-col h-full w-full bg-wa-bg-light dark:bg-wa-bg-dark text-slate-900 dark:text-slate-100 transition-colors">
      {/* In-App Notifications */}
      <InAppNotification 
        notification={lastNotification} 
        onClose={() => setLastNotification(null)}
        onAction={(chatId) => {
          // Open the chat
          const chatDocRef = doc(db, 'chats', chatId);
          onSnapshot(chatDocRef, (snap) => {
            if (snap.exists()) {
              setSelectedChat({ id: snap.id, ...snap.data() });
              setLastNotification(null);
            }
          });
        }}
      />

      {/* Global Top Nav - Hidden on mobile if chat is open */}
      <header className={`h-14 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 justify-between bg-wa-panel-light dark:bg-wa-panel-dark z-50 transition-colors shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-wa-teal rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-wa-teal/20">
            <img 
              src={appConfig.logo} 
              alt={appConfig.name} 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const span = document.createElement('span');
                  span.innerText = 'AS';
                  span.className = 'text-white font-bold text-xs';
                  parent.appendChild(span);
                }
              }}
            />
          </div>
          <div className="leading-none">
            <h1 className="text-sm font-bold tracking-tight">{appConfig.name}</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Secure Protocol 2.0</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => { setSelectedChat(null); setTimeout(() => { window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'settings' })); }, 100); }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full text-slate-500 dark:text-zinc-400 transition-all"
              title="Global Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <div 
              onClick={() => setSelectedChat({ isProfileEdit: true })}
              className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-full text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800 cursor-pointer transition-all shadow-sm"
            >
            <span className="hidden sm:inline font-black">@{profile?.displayName}</span>
            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden ring-2 ring-wa-green/30">
               {profile?.profilePic && <img src={profile.profilePic} className="w-full h-full object-cover" />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-wa-teal dark:text-wa-green cursor-pointer">
            <span className="hidden sm:inline font-black uppercase tracking-widest text-[9px]">Active</span>
            <div className="w-2 h-2 rounded-full bg-current animate-pulse shadow-md"></div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - Hidden on mobile if chat selected */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className={`fixed inset-0 sm:relative sm:inset-auto w-full sm:w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-wa-panel-light dark:bg-wa-panel-dark transition-all z-40 will-change-transform`}
            >
              <Sidebar onChatSelect={(chat) => setSelectedChat(chat)} selectedChatId={selectedChat?.id} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Window / Profile Edit / Sponsored Ad */}
        <main className={`flex-1 flex flex-col min-w-0 transition-all bg-wa-bg-light dark:bg-wa-bg-dark overflow-x-hidden`}>
          {selectedChat?.isProfileEdit ? (
            <div className="flex-1 overflow-y-auto no-scrollbar py-6 bg-wa-bg-light dark:bg-wa-bg-dark">
               <div className="max-w-2xl mx-auto px-4">
                  <header className="mb-8 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">Edit Profile</h2>
                      <p className="text-sm text-zinc-500">Update your identity on AdSid</p>
                    </div>
                    <button 
                      onClick={() => setSelectedChat(null)}
                      className="px-4 py-1.5 bg-wa-teal dark:bg-wa-green text-white dark:text-wa-dark-green rounded-lg text-xs font-bold shadow-md"
                    >
                      Close
                    </button>
                  </header>
                  <ProfileSetup onComplete={() => setSelectedChat(null)} />
               </div>
            </div>
          ) : selectedChat?.isSponsored ? (
            <SponsoredVideoView ad={selectedChat} onClose={() => setSelectedChat(null)} />
          ) : selectedChat ? (
            <ChatWindow chat={selectedChat} onBack={() => setSelectedChat(null)} />
          ) : (
            <div className="hidden sm:flex flex-1 flex-col items-center justify-center text-zinc-400 gap-6">
              <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-900 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden">
                <img 
                  src={appConfig.logo} 
                  alt={appConfig.name} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      const span = document.createElement('span');
                      span.innerText = 'AS';
                      span.className = 'text-2xl font-black italic tracking-tighter text-wa-teal';
                      parent.appendChild(span);
                    }
                  }}
                />
              </div>
              <div className="text-center px-4">
                <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Select a secure channel</h3>
                <p className="text-[10px] mt-2 font-medium">Discover accounts and start private conversations.</p>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar - Info (Desktop Only) */}
        {selectedChat && !selectedChat.isProfileEdit && (
          <aside className="hidden xl:flex w-72 border-l border-slate-200 dark:border-slate-800 bg-wa-panel-light dark:bg-wa-panel-dark flex-col p-6 transition-colors">
            <div className="text-center mb-8">
              <div className="w-24 h-24 bg-slate-100 dark:bg-zinc-800 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl overflow-hidden ring-4 ring-white dark:ring-zinc-900 shadow-xl">
                 {selectedChat.profilePic ? <img src={selectedChat.profilePic} className="w-full h-full object-cover" /> : "👤"}
              </div>
              <h3 className="text-md font-black uppercase tracking-tight">{selectedChat.name || "AdSid Member"}</h3>
              <p className="text-[10px] text-wa-teal dark:text-wa-green font-black uppercase tracking-[0.2em] mt-1">Certified Node</p>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-3">Shared Vault</div>
                <div className="grid grid-cols-3 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="aspect-square bg-slate-50 dark:bg-zinc-900 rounded-lg flex items-center justify-center border border-slate-200 dark:border-slate-800/50">
                      {i === 5 ? <span className="text-[10px] text-zinc-400">+0</span> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800/50">
                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-4">Privacy Config</div>
                <div className="flex items-center justify-between py-1 px-1">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400">Ephemeral Sync</span>
                  <div className="w-8 h-4 bg-wa-green rounded-full relative cursor-pointer shadow-inner">
                    <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto">
              <div className="p-4 bg-wa-teal/5 dark:bg-wa-green/5 border border-wa-teal/10 dark:border-wa-green/10 rounded-xl text-[10px] text-wa-teal dark:text-wa-green leading-relaxed font-bold">
                Tip: Swipe right on messages to save them indefinitely.
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
