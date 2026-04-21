import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Smile, Paperclip, MoreVertical, ChevronLeft, Check, CheckCheck, Save, Trash2, User, CheckCircle2, Image as ImageIcon, Gift, X, Play } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDocs } from 'firebase/firestore';
import EmojiPicker from 'emoji-picker-react';
import { format } from 'date-fns';
import { useChat } from '../contexts/ChatContext';
import ReactPlayer from 'react-player';

const Player = ReactPlayer as any;

interface ChatWindowProps {
  chat: any;
  onBack: () => void;
}

export default function ChatWindow({ chat, onBack }: ChatWindowProps) {
  const { user, profile } = useChat();
  const { theme } = useTheme();
  const [liveChat, setLiveChat] = useState<any>(chat);
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Trigger re-render for status staleness periodically
  useEffect(() => {
    const timer = setInterval(() => setForceUpdate(s => s + 1), 10000); // 10s check
    return () => clearInterval(timer);
  }, []);

  const isOtherOnline = () => {
    if (!otherProfile || otherProfile.status !== 'online') return false;
    const now = Date.now();
    let lastSeenMillis = 0;
    try {
      if (otherProfile.lastSeen && typeof otherProfile.lastSeen.toMillis === 'function') {
        lastSeenMillis = otherProfile.lastSeen.toMillis();
      } else if (otherProfile.lastSeen?.seconds) {
        lastSeenMillis = otherProfile.lastSeen.seconds * 1000;
      }
    } catch (e) {
      return true;
    }
    return (now - lastSeenMillis) < 45000; // 45s threshold
  };

  // Listen for current chat document updates
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'chats', chat.id), (snap) => {
      if (snap.exists()) {
        setLiveChat({ id: snap.id, ...snap.data() });
      }
    });
    return () => unsub();
  }, [chat.id]);

  // Listen for messages
  useEffect(() => {
    const q = query(
      collection(db, 'chats', chat.id, 'messages'),
      orderBy('timestamp', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [chat.id]);

  // GIF Search logic (Simplified public API)
  useEffect(() => {
    if (!gifSearch || !showGifs) return;
    const fetchGifs = async () => {
      try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${gifSearch}&limit=10`);
        const data = await res.json();
        setGifs(data.data || []);
      } catch (err) {
        console.error("GIF search failed", err);
      }
    };
    const timer = setTimeout(fetchGifs, 500);
    return () => clearTimeout(timer);
  }, [gifSearch, showGifs]);

  // Listen for other participant profile if not in details
  useEffect(() => {
    const otherId = chat.participants?.find((id: string) => id !== user?.uid);
    if (!otherId) return;
    
    const unsub = onSnapshot(doc(db, 'users', otherId), (snap) => {
      if (snap.exists()) {
        setOtherProfile(snap.data());
      }
    });
    return () => unsub();
  }, [chat.id, chat.participants, user?.uid]);
  useEffect(() => {
    if (!user || messages.length === 0) return;
    
    const unseenMessages = messages.filter(m => m.senderId !== user.uid && !m.seenBy?.includes(user.uid));
    
    if (unseenMessages.length > 0) {
      unseenMessages.forEach(async (m) => {
        await updateDoc(doc(db, 'chats', chat.id, 'messages', m.id), {
          seenBy: arrayUnion(user.uid)
        });
      });
      // also update the chat's last message status if needed
      updateDoc(doc(db, 'chats', chat.id), {
        'lastMessage.seen': true
      });
    }

    // Vanish Mode: Mark messages to be cleared when chat closes
    return () => {
      if (liveChat.disappearingMode) {
        messages.forEach(async (m) => {
          if (m.seenBy?.length >= 2) {
            try {
              await deleteDoc(doc(db, 'chats', chat.id, 'messages', m.id));
            } catch (e) { /* ignore */ }
          }
        });
      }
    };
  }, [messages, user, chat.id, liveChat.disappearingMode]);

  const sendMessage = async (e?: React.FormEvent, customData?: any) => {
    e?.preventDefault();
    if (!message.trim() && !customData && !user) return;

    const content = message;
    setMessage('');
    setShowEmoji(false);
    setShowGifs(false);

    const msgData = {
      chatId: chat.id,
      senderId: user?.uid,
      senderName: profile?.displayName || user?.displayName, // Use profile name
      content: customData?.content || content,
      type: customData?.type || 'text',
      mediaUrl: customData?.url || null,
      timestamp: serverTimestamp(),
      seenBy: [user?.uid],
      savedBy: []
    };

    await addDoc(collection(db, 'chats', chat.id, 'messages'), msgData);
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: { 
        content: customData?.type === 'image' ? '📷 Image' : (customData?.type === 'gif' ? '🎬 GIF' : content), 
        timestamp: serverTimestamp(),
        senderId: user?.uid,
        seen: false
      }
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    // In a real app, we would use Firebase Storage. For now, we'll use a data URL for demo purpses.
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await sendMessage(undefined, { type: 'image', url: base64, content: 'Sent an image' });
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await deleteDoc(doc(db, 'chats', chat.id, 'messages', msgId));
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  const deleteChat = async () => {
    if (!confirm("Delete this entire chat? This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      // 1. Unsubscribe/Stop UI updates if possible (though we unmount soon)
      // 2. Delete all messages first
      const msgs = await getDocs(collection(db, 'chats', chat.id, 'messages'));
      const batchSize = 20; // Delete in chunks
      for (let i = 0; i < msgs.docs.length; i += batchSize) {
        const chunk = msgs.docs.slice(i, i + batchSize);
        await Promise.all(chunk.map(m => deleteDoc(m.ref)));
      }
      // 3. Delete chat document
      await deleteDoc(doc(db, 'chats', chat.id));
      setIsDeleting(false);
      onBack();
    } catch (err) {
      console.error("Failed to delete chat", err);
      setIsDeleting(false);
      alert("Delete failed. Check connection.");
    }
  };

  const toggleDisappearingMode = async () => {
    try {
      await updateDoc(doc(db, 'chats', chat.id), {
        disappearingMode: !liveChat.disappearingMode
      });
      setShowMenu(false);
    } catch (err) {
      console.error("Failed to toggle disappearing mode", err);
    }
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const isVideoLink = (url: string) => {
    return ReactPlayer.canPlay(url);
  };

  const saveMessage = async (msgId: string, isSaved: boolean) => {
    const msgRef = doc(db, 'chats', chat.id, 'messages', msgId);
    if (isSaved) {
      await updateDoc(msgRef, { savedBy: arrayRemove(user?.uid) });
    } else {
      await updateDoc(msgRef, { savedBy: arrayUnion(user?.uid) });
    }
  };

  return (
    <div className="flex h-full bg-[#E5DDD5] dark:bg-[#0B141A] relative overflow-hidden transition-colors">
      <div className={`flex flex-col flex-1 h-full relative transition-all duration-300 ${showInfo ? 'mr-0 sm:mr-80' : ''}`}>
        {/* WhatsApp Wallpaper Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none bg-[url('https://picsum.photos/seed/pattern/1000/1000')] bg-repeat" />

        {/* Header - WhatsApp Teal */}
        <div className="h-16 bg-wa-teal dark:bg-wa-panel-dark text-white flex items-center px-4 justify-between sticky top-0 z-10 shadow-md">
          <div 
            className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors flex-1 min-w-0"
            onClick={() => setShowInfo(!showInfo)}
          >
            <button 
              onClick={(e) => { e.stopPropagation(); onBack(); }} 
              className="md:hidden p-1.5 hover:bg-white/10 rounded-full transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/20 shrink-0 shadow-inner">
               {chat.profilePic || otherProfile?.profilePic ? (
                 <img src={chat.profilePic || otherProfile?.profilePic} alt="" className="w-full h-full object-cover" />
               ) : (
                 <User className="w-6 h-6 text-white/50" />
               )}
            </div>
            <div className="min-w-0 text-left">
              <h2 className="text-sm font-bold truncate tracking-tight">
                {chat.type === 'group' ? (chat.name || "Security Group") : (otherProfile?.displayName || chat.participantDetails?.[chat.participants?.find((id: string) => id !== user?.uid)]?.name || "Secure Profile")}
              </h2>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full shadow-md ${isOtherOnline() ? 'bg-wa-green animate-pulse shadow-wa-green/50' : 'bg-slate-400'}`} />
                <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest text-[#D1D7DB] dark:text-[#8696A0]">
                  {isOtherOnline() ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold border border-white/10 backdrop-blur-sm">
              <CheckCircle2 className="w-3 h-3 text-wa-green" />
              Secure Sync Active
            </div>
            <div className="relative">
              <button 
                onClick={() => setShowMenu(!showMenu)}
                className={`p-2 rounded-full transition-all ${showMenu ? 'bg-white/20' : 'hover:bg-white/10'} opacity-70`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-wa-panel-dark text-slate-900 dark:text-slate-100 rounded-xl shadow-2xl overflow-hidden z-30 border border-slate-200 dark:border-slate-800"
                  >
                    <button 
                      onClick={() => { setShowInfo(true); setShowMenu(false); }}
                      className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-wa-panel-light/10 transition-colors"
                    >
                      <User className="w-4 h-4 text-wa-teal dark:text-wa-green" />
                      <span className="text-[13px] font-bold">Contact Info</span>
                    </button>
                    <button 
                      onClick={toggleDisappearingMode}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-wa-panel-light/10 transition-colors"
                    >
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[13px] font-bold uppercase tracking-tight">Disappearing Mode</span>
                        <span className={`text-[10px] font-black uppercase ${liveChat.disappearingMode ? 'text-wa-green' : 'text-zinc-500'}`}>
                          {liveChat.disappearingMode ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className={`w-11 h-6 rounded-full relative transition-all duration-300 ${liveChat.disappearingMode ? 'bg-wa-green shadow-[0_0_10px_rgba(37,211,102,0.3)]' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                        <motion.div 
                          animate={{ x: liveChat.disappearingMode ? 22 : 2 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" 
                        />
                      </div>
                    </button>
                    <button 
                      onClick={deleteChat}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-3 p-4 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition-colors border-t border-slate-100 dark:border-slate-800 disabled:opacity-50"
                    >
                      {isDeleting ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent animate-spin rounded-full" /> : <Trash2 className="w-4 h-4" />}
                      <span className="text-[13px] font-bold">Delete Chat</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar relative z-0">
        {messages.map((msg, idx) => {
          const isOwn = msg.senderId === user?.uid;
          const isSaved = msg.savedBy?.includes(user?.uid);
          
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`message-bubble max-w-[85%] sm:max-w-[70%] ${isOwn ? 'message-out' : 'message-in'} ${isSaved ? 'ring-2 ring-wa-green ring-offset-2 dark:ring-offset-wa-bg-dark' : ''} p-1 overflow-hidden shadow-sm`}
              >
                {!isOwn && (
                  <p className="text-[10px] font-black text-wa-teal dark:text-wa-green mb-1 px-2 pt-1">{msg.senderName}</p>
                )}
                
                <div className="px-2 py-1">
                  {msg.type === 'image' && (
                    <motion.img 
                      layoutId={`img-${msg.id}`}
                      src={msg.mediaUrl} 
                      className="rounded-lg mb-2 max-w-full h-auto cursor-pointer border border-slate-100 dark:border-slate-800"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  {msg.type === 'gif' && (
                    <img 
                      src={msg.mediaUrl} 
                      className="rounded-lg mb-2 max-w-full h-auto"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  {msg.content && !isVideoLink(msg.content) && (
                    <p className="whitespace-pre-wrap leading-relaxed dark:text-slate-200 text-[14px]">{msg.content}</p>
                  )}

                  {msg.content && isVideoLink(msg.content) && (
                    <div className="space-y-2">
                       <p className="text-blue-500 underline text-xs break-all">{msg.content}</p>
                       <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video relative group">
                         <Player 
                            url={msg.content} 
                            width="100%" 
                            height="100%" 
                            light={true}
                            playIcon={<div className="bg-wa-teal p-3 rounded-full shadow-lg"><Play className="text-white fill-current" /></div>}
                         />
                       </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-end gap-1 px-2 pb-1 opacity-60">
                   <span className="text-[9px] uppercase font-bold tracking-tighter">
                     {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                   </span>
                   {isOwn && (
                     <span className="text-blue-500 flex items-center">
                       {msg.seenBy?.length > 1 ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                     </span>
                   )}
                   {isSaved && <Save className="w-2.5 h-2.5 text-wa-green fill-current" />}
                </div>

                {/* Interactions */}
                <div className="absolute -right-2 top-0 translate-x-full flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => saveMessage(msg.id, isSaved)}
                    className="p-1 hover:text-wa-green"
                    title="Save message"
                  >
                    <Save className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-wa-green' : 'text-slate-400'}`} />
                  </button>
                  {isOwn && (
                    <button 
                      onClick={() => deleteMessage(msg.id)}
                      className="p-1 hover:text-red-500"
                      title="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <footer className="p-3 bg-[#F0F2F5] dark:bg-[#111B21] transition-colors relative">
        {/* GIF Picker Overlay */}
        <AnimatePresence>
          {showGifs && (
             <motion.div 
               initial={{ opacity: 0, y: 100 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 100 }}
               className="absolute bottom-full left-0 w-full bg-white dark:bg-[#111B21] border-t border-slate-200 dark:border-slate-800 z-20 h-[300px] flex flex-col p-4 gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]"
             >
                <div className="flex items-center justify-between">
                  <h3 className="font-black italic text-wa-teal dark:text-wa-green uppercase tracking-widest text-xs">GIF Search</h3>
                  <button onClick={() => setShowGifs(false)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5"/></button>
                </div>
                <input 
                  type="text" 
                  placeholder="Seach GIFs via Giphy..."
                  value={gifSearch}
                  onChange={(e) => setGifSearch(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-zinc-900 border-none rounded-xl px-4 py-2 text-sm focus:outline-none dark:text-white"
                />
                <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-4 no-scrollbar pb-2">
                   {gifs.length > 0 ? (
                     gifs.map(gif => (
                       <button 
                        key={gif.id} 
                        onClick={() => sendMessage(undefined, { type: 'gif', url: gif.images.fixed_height.url, content: 'Sent a GIF' })}
                        className="flex-shrink-0 h-full aspect-square rounded-xl overflow-hidden hover:scale-105 transition-transform border border-slate-100 dark:border-slate-800"
                       >
                         <img src={gif.images.fixed_height.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                       </button>
                     ))
                   ) : (
                     <p className="text-slate-400 text-xs w-full text-center">Search for trending expressions...</p>
                   )}
                </div>
             </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={sendMessage} className="flex items-center gap-2 max-w-5xl mx-auto">
          <div className="flex items-center bg-white dark:bg-[#2A3942] rounded-full px-4 py-2 flex-1 shadow-sm border border-slate-200 dark:border-none">
            <div className="flex items-center gap-1.5 mr-3 border-r border-slate-100 dark:border-slate-700 pr-3">
              <button 
                type="button" 
                onClick={() => setShowEmoji(!showEmoji)}
                className="text-slate-500 dark:text-slate-400 hover:text-wa-teal transition-colors"
                title="Emojis"
              >
                <Smile className="w-6 h-6" />
              </button>
              <button 
                type="button" 
                onClick={() => setShowGifs(!showGifs)}
                className={`transition-colors ${showGifs ? 'text-wa-green' : 'text-slate-500 dark:text-slate-400 hover:text-wa-teal'}`}
                title="Gifs"
              >
                <Gift className="w-6 h-6" />
              </button>
            </div>

            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onFocus={() => { setShowEmoji(false); setShowGifs(false); }}
              placeholder="Type a message"
              className="bg-transparent text-[14px] w-full focus:outline-none dark:text-slate-100 placeholder:text-slate-400"
            />
            
            <div className="flex items-center gap-2 ml-2">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-slate-500 dark:text-slate-400 hover:text-wa-teal"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button type="button" className="text-slate-500 dark:text-slate-400">
                <Paperclip className="w-5 h-5 -rotate-45" />
              </button>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload}
            />
          </div>

          <button
            type="submit"
            disabled={!message.trim() && !uploading}
            className="bg-wa-teal dark:bg-wa-green p-3 rounded-full text-white dark:text-wa-dark-green hover:opacity-90 transition-all disabled:opacity-50 shadow-md transform active:scale-90"
          >
            {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Send className="w-5 h-5" />}
          </button>
        </form>

        <AnimatePresence>
          {showEmoji && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden"
            >
              <EmojiPicker 
                theme={theme as any} 
                onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)}
                width={320}
                height={400}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>

    {/* Info Sidebar (Contact Details) */}
    <AnimatePresence>
      {showInfo && (
        <motion.div 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute top-0 right-0 w-full sm:w-80 h-full bg-wa-panel-light dark:bg-wa-panel-dark border-l border-slate-200 dark:border-slate-800 z-50 overflow-y-auto no-scrollbar shadow-2xl transition-colors"
        >
          {/* Info Header */}
          <div className="h-16 bg-wa-teal dark:bg-wa-panel-dark flex items-center px-6 text-white sticky top-0 z-10 shadow-sm transition-colors">
            <button 
              onClick={() => setShowInfo(false)} 
              className="mr-4 p-1 rounded-full hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-sm uppercase tracking-widest leading-none">Contact Info</h3>
          </div>

          <div className="p-0">
            <div className="flex flex-col items-center py-8 bg-white dark:bg-wa-panel-light/5">
              <div className="w-32 h-32 rounded-full overflow-hidden mb-4 border-4 border-white dark:border-wa-panel-dark shadow-xl">
                 {chat.profilePic || otherProfile?.profilePic ? (
                   <img src={chat.profilePic || otherProfile?.profilePic} alt="" className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-wa-teal/10">
                     <User className="w-16 h-16 text-wa-teal/30" />
                   </div>
                 )}
              </div>
              <h2 className="text-xl font-bold dark:text-white uppercase tracking-tight">
                {otherProfile?.displayName || chat.participantDetails?.[chat.participants?.find((id: string) => id !== user?.uid)]?.name}
              </h2>
              <div className="flex items-center gap-1.5 mt-1">
                <div className={`w-2 h-2 rounded-full ${isOtherOnline() ? 'bg-wa-green animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">
                  {isOtherOnline() ? 'Active on Protocol' : 'Node Offline'}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green">Bio / Signature</label>
                <p className="text-sm dark:text-slate-300 leading-relaxed italic">
                  "{otherProfile?.bio || "No status cryptographic signature provided."}"
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-100 dark:border-zinc-800">
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Gender</label>
                  <span className="text-sm font-bold dark:text-slate-200">{otherProfile?.gender || "Unknown"}</span>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-100 dark:border-zinc-800">
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Vetted Age</label>
                  <span className="text-sm font-bold dark:text-slate-200">{otherProfile?.age || "???"}+</span>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                 <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-4 opacity-70">Shared Vault Settings</div>
                 <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/30 rounded-xl">
                   <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400">Ephemeral Logs</span>
                   <div className={`w-8 h-4 rounded-full relative ${liveChat.disappearingMode ? 'bg-wa-green' : 'bg-slate-300'} transition-colors`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${liveChat.disappearingMode ? 'right-0.5' : 'left-0.5'}`} />
                   </div>
                 </div>
              </div>

              <button 
                onClick={deleteChat}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-3 p-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl transition-all shadow-lg shadow-red-500/20 active:scale-[0.98] disabled:opacity-50"
              >
                {isDeleting ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Trash2 className="w-5 h-5" />}
                <span className="text-[14px] font-black uppercase tracking-widest">Wipe This Channel</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
}
