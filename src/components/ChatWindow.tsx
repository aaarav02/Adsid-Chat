import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Smile, Paperclip, MoreVertical, ChevronLeft, Check, CheckCheck, Save, Trash2, User, CheckCircle2, Image as ImageIcon, Gift, X, Play, FileText, Users, UserPlus, Bell, BellOff, ChevronDown, Pencil } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
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
  const { user, profile, toggleMute } = useChat();
  const { theme, chatBackground, setChatBackground } = useTheme();
  const [liveChat, setLiveChat] = useState<any>(chat);
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [isTyping, setIsTyping] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, any>>({});
  const [showMenu, setShowMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [showAddNode, setShowAddNode] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState(liveChat.name || '');
  const [editingPic, setEditingPic] = useState('');
  const [participantsProfiles, setParticipantsProfiles] = useState<Record<string, any>>({});
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, msg: any } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [chat.id]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setShowScrollButton(!isAtBottom);
  };

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
        const data = snap.id ? { id: snap.id, ...snap.data() } : snap.data();
        setLiveChat(data);
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
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Mention logic: check only the LATEST message coming in
      const latest = newMessages[newMessages.length - 1];
      if (latest && latest.senderId !== user?.uid && profile?.protocolId) {
        if (latest.content?.includes(`@${profile.protocolId}`)) {
           console.log(`[Protocol Alert] Mentioned by ${latest.senderName}`);
        }
      }

      setMessages(newMessages);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [chat.id, user?.uid, profile?.protocolId]);

  // GIF Search logic
  useEffect(() => {
    if (!showGifs) return;
    const fetchGifs = async () => {
      try {
        const queryStr = gifSearch || 'trending';
        const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${queryStr}&limit=12`);
        const data = await res.json();
        setGifs(data.data || []);
      } catch (err) {
        console.error("GIF search failed", err);
      }
    };
    fetchGifs();
  }, [gifSearch, showGifs]);

  // Listen for other participant profile if private chat
  useEffect(() => {
    const otherId = chat.participants?.find((id: string) => id !== user?.uid);
    if (!otherId || chat.type === 'group') return;
    
    const unsub = onSnapshot(doc(db, 'users', otherId), (snap) => {
      if (snap.exists()) {
        setOtherProfile(snap.data());
      }
    });
    return () => unsub();
  }, [chat.id, chat.participants, user?.uid, chat.type]);

  // Read status & Vanish mode logic
  useEffect(() => {
    if (!user || messages.length === 0) return;
    
    const unseenMessages = messages.filter(m => m.senderId !== user.uid && !m.seenBy?.includes(user.uid));
    
    if (unseenMessages.length > 0) {
      const markAsSeen = async () => {
        const batch = writeBatch(db);
        unseenMessages.forEach((m) => {
          batch.update(doc(db, 'chats', chat.id, 'messages', m.id), {
            seenBy: arrayUnion(user.uid)
          });
        });
        batch.update(doc(db, 'chats', chat.id), { 'lastMessage.seen': true });
        try {
          await batch.commit();
          setQuotaExceeded(false);
        } catch (e: any) {
          if (e.code === 'resource-exhausted') {
            setQuotaExceeded(true);
            console.error("Critical: Firestore Quota Exceeded. Writes disabled until reset.");
          }
        }
      };
      markAsSeen();
    }

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

  // Typing status logic with write-minimization
  const lastTypingUpdate = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !chat.id) return;
    
    const updateTyping = async (targetChatId: string | null) => {
      if (lastTypingUpdate.current === targetChatId) return; // Prevent redundant writes
      lastTypingUpdate.current = targetChatId;
      try {
        await updateDoc(doc(db, 'profiles', user.uid), {
          isTypingIn: targetChatId
        });
      } catch (e) { /* Quota check */ }
    };

    if (message.length > 0) {
      updateTyping(chat.id);
      const timer = setTimeout(() => updateTyping(null), 5000); // 5s grace period
      return () => clearTimeout(timer);
    } else {
      updateTyping(null);
    }
  }, [message, chat.id, user]);

  // Aggregated Member Status/Typing listener
  useEffect(() => {
    if (!chat.participants) return;
    const unsubs = chat.participants.map((pid: string) => {
      return onSnapshot(doc(db, 'profiles', pid), (snap) => {
        if (snap.exists()) {
          setParticipantsProfiles(prev => ({ ...prev, [pid]: snap.data() }));
        }
      });
    });
    return () => unsubs.forEach((unsub: any) => unsub());
  }, [chat.participants]);

  // Derived Typing Display
  useEffect(() => {
    const typingPerson = Object.values(participantsProfiles).find(p => p.isTypingIn === chat.id && p.uid !== user?.uid);
    if (typingPerson) {
      setIsTyping(typingPerson.displayName || typingPerson.name || "A member");
    } else {
      setIsTyping(null);
    }
  }, [participantsProfiles, chat.id, user?.uid]);

  // Fetch friends for "Add Node"
  useEffect(() => {
    if (!user || !showAddNode) return;
    const q = query(collection(db, 'users', user.uid, 'friends'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setFriends(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user, showAddNode]);

  const sendMessage = async (e?: React.FormEvent, customData?: any) => {
    e?.preventDefault();
    if (!message.trim() && !customData && !user) return;

    if (editingMessage) {
      try {
        await updateDoc(doc(db, 'chats', chat.id, 'messages', editingMessage.id), {
          content: message,
          isEdited: true,
          updatedAt: serverTimestamp()
        });
        setEditingMessage(null);
        setMessage('');
        return;
      } catch (err) {
        console.error("Editing failed", err);
        return;
      }
    }

    const content = message;
    setMessage('');
    setShowEmoji(false);
    setShowGifs(false);

    const msgData: any = {
      chatId: chat.id,
      senderId: user?.uid,
      senderName: profile?.displayName || user?.displayName,
      content: customData?.content || content,
      type: customData?.type || 'text',
      mediaUrl: customData?.url || null,
      fileName: customData?.fileName || null,
      cloudinaryId: customData?.cloudinaryId || null,
      timestamp: serverTimestamp(),
      seenBy: [user?.uid],
      savedBy: []
    };

    if (replyTo) {
      msgData.replyTo = {
        id: replyTo.id,
        content: replyTo.content,
        senderName: replyTo.senderName,
        type: replyTo.type
      };
      setReplyTo(null);
    }

    let finalMsgData = { ...msgData };
    
    // Check for link previews
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex);
    if (urls && urls.length > 0) {
      try {
        const res = await fetch(`/api/preview?url=${encodeURIComponent(urls[0])}`);
        if (res.ok) {
          const metadata = await res.json();
          finalMsgData = { ...finalMsgData, linkPreview: metadata } as any;
        }
      } catch (e) { /* ignore */ }
    }

    await addDoc(collection(db, 'chats', chat.id, 'messages'), finalMsgData);
    
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: { 
        content: customData?.type === 'image' ? '📷 Image' : (customData?.type === 'gif' ? '🎬 GIF' : (customData?.type === 'video' ? '🎥 Video' : (customData?.type === 'file' ? '📄 Document' : content))), 
        timestamp: serverTimestamp(),
        senderId: user?.uid,
        seen: false
      }
    });
  };

  const deleteChat = async () => {
    if (!confirm("Confirm complete erasure of this protocol channel?")) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      const msgs = await getDocs(collection(db, 'chats', chat.id, 'messages'));
      msgs.forEach(m => batch.delete(m.ref));
      batch.delete(doc(db, 'chats', chat.id));
      await batch.commit();
      onBack();
    } catch (err) {
      console.error(err);
      alert("Erasing sequence failed.");
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      const msg = messages.find(m => m.id === msgId);
      if (msg?.cloudinaryId) {
        fetch('/api/delete-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_id: msg.cloudinaryId })
        }).catch(err => console.error("Cloudinary deletion failed", err));
      }
      await deleteDoc(doc(db, 'chats', chat.id, 'messages', msgId));
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  };

  const startEditing = (msg: any) => {
    setEditingMessage(msg);
    setMessage(msg.content);
    setShowEmoji(false);
    setShowGifs(false);
    setContextMenu(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setContextMenu(null);
    // Optional: show a toast
  };

  const addNodeToGroup = async (friend: any) => {
    if (!liveChat.admins?.includes(user?.uid!) && liveChat.restricted) {
      alert("Admin authorization required for node expansion.");
      return;
    }
    try {
      await updateDoc(doc(db, 'chats', chat.id), {
        participants: arrayUnion(friend.uid),
        [`participantDetails.${friend.uid}`]: {
          name: friend.displayName || friend.name || "Unknown",
          pic: friend.profilePic || friend.pic || "",
          handle: friend.protocolId || friend.handle || "anon"
        }
      });
      alert(`Node ${friend.displayName} synced to channel.`);
    } catch (e) {
      alert("Node sync failed.");
    }
  };

  const updateGroupBranding = async () => {
    const isAdmin = liveChat.admins?.includes(user?.uid!);
    if (!isAdmin && liveChat.restricted) {
      alert("Unauthorized: Governance protocol active.");
      return;
    }
    try {
      await updateDoc(doc(db, 'chats', chat.id), { 
        name: editingName || liveChat.name,
        groupPic: editingPic || liveChat.groupPic 
      });
      alert("Channel logic updated.");
      setShowSettings(false);
    } catch (e) {
      alert("Update failed.");
    }
  };

  const promoteAdmin = async (pid: string) => {
    if (!liveChat.admins?.includes(user?.uid!)) {
        alert("Admin override required.");
        return;
    }
    try {
        await updateDoc(doc(db, 'chats', chat.id), {
            admins: arrayUnion(pid)
        });
        alert("Node promoted to Admin status.");
    } catch (e) {
        alert("Promotion failed.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Get signature from our server
      const sigRes = await fetch('/api/upload-signature');
      const { timestamp, signature, apiKey, cloudName } = await sigRes.json();

      if (!cloudName) {
        throw new Error("Cloudinary Cloud Name is not configured");
      }

      // 2. Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (data.secure_url) {
        let type: 'image' | 'video' | 'file' = 'file';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        
        await sendMessage(undefined, { 
          type, 
          url: data.secure_url, 
          content: `Shared ${file.name}`,
          fileName: file.name,
          cloudinaryId: data.public_id
        });
      } else {
        throw new Error(data.error?.message || "Upload failed");
      }
    } catch (err) {
      console.error("Cloudinary upload failed", err);
      alert("Media delivery failed: Support for this protocol upload node is pending configuration.");
    } finally {
      setUploading(false);
      setShowAttachMenu(false);
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

  const renderMessageContent = (msg: any) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const mentionRegex = /(@[a-z0-9_]+)/g;

    const parts = msg.content.split(/((?:https?:\/\/[^\s]+)|(?:@[a-z0-9_]+))/g);

    return (
      <div className="space-y-3">
        <p className="whitespace-pre-wrap leading-relaxed dark:text-slate-200 text-[14px]">
          {parts.map((part, i) => {
            if (urlRegex.test(part)) {
              return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline break-all">{part}</a>;
            }
            if (mentionRegex.test(part)) {
              return <span key={i} className="text-wa-teal dark:text-wa-green font-black bg-wa-green/10 px-1 rounded">@{part.slice(1)}</span>;
            }
            return part;
          })}
        </p>

        {msg.linkPreview && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="block bg-black/5 dark:bg-white/5 rounded-xl border-l-4 border-wa-teal dark:border-wa-green overflow-hidden mt-2 no-underline"
          >
            {msg.linkPreview.image && (
              <div 
                className="relative group/preview cursor-pointer" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  e.stopPropagation(); 
                  if (msg.linkPreview.isYoutube) {
                    setFullscreenMedia({ url: msg.linkPreview.url, type: 'video' });
                  } else {
                    setFullscreenMedia({ url: msg.linkPreview.image, type: 'image' });
                  }
                }}
              >
                <img 
                  src={msg.linkPreview.image} 
                  className="w-full h-32 object-cover" 
                  referrerPolicy="no-referrer" 
                />
                {msg.linkPreview.isYoutube && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover/preview:bg-black/30 transition-colors">
                    <div className="bg-wa-teal p-2 rounded-full shadow-lg">
                      <Play className="text-white fill-current w-4 h-4 ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
            )}
            <a href={msg.linkPreview.url} target="_blank" rel="noopener noreferrer" className="p-3 block no-underline">
              <h4 className="text-[13px] font-bold dark:text-white line-clamp-1">{msg.linkPreview.title}</h4>
              <p className="text-[11px] opacity-60 dark:text-slate-300 line-clamp-2 mt-0.5">{msg.linkPreview.description}</p>
            </a>
          </motion.div>
        )}
        
        {msg.content.match(urlRegex)?.map((url: string, i: number) => {
          if (isVideoLink(url)) {
            return (
              <div 
                key={i} 
                className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video relative group cursor-pointer"
                onClick={() => setFullscreenMedia({ url, type: 'video' })}
              >
                <div className="absolute inset-0 z-10 pointer-events-none" />
                <Player 
                  url={url} 
                  width="100%" 
                  height="100%" 
                  light={true}
                  playIcon={<div className="bg-wa-teal p-3 rounded-full shadow-lg"><Play className="text-white fill-current" /></div>}
                  style={{ pointerEvents: 'none' }}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  const getBackgroundStyle = () => {
    switch (chatBackground) {
      case 'wa-green': return 'bg-[#075E54] dark:bg-[#053d37]';
      case 'wa-dark': return 'bg-[#0B141A] dark:bg-[#070b0e]';
      case 'cyber-teal': return 'bg-wa-teal dark:bg-wa-dark-green';
      default: return 'bg-[#E5DDD5] dark:bg-[#0B141A]';
    }
  };

  return (
    <div className={`flex h-dvh sm:h-full ${getBackgroundStyle()} relative overflow-hidden transition-colors`}>
      <div className={`flex flex-col flex-1 h-full relative transition-all duration-300 overflow-hidden ${showInfo ? 'mr-0 sm:mr-80 md:mr-[380px]' : ''}`}>
        <div className={`absolute inset-0 opacity-[0.06] dark:opacity-[0.03] pointer-events-none z-[-1] ${chatBackground === 'minimal' ? 'bg-[url("https://picsum.photos/seed/pattern/1000/1000")] bg-repeat' : ''}`} />

        <div className="h-16 shrink-0 bg-wa-teal dark:bg-wa-panel-dark text-white flex items-center px-4 justify-between z-30 shadow-md sticky top-0">
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
            <div 
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/20 shrink-0 shadow-inner cursor-zoom-in"
              onClick={(e) => { e.stopPropagation(); setFullscreenMedia({ url: liveChat.groupPic || chat.profilePic || otherProfile?.profilePic, type: 'image' }); }}
            >
               {(liveChat.groupPic || chat.profilePic || otherProfile?.profilePic) ? (
                 <img src={liveChat.groupPic || chat.profilePic || otherProfile?.profilePic} alt="" className="w-full h-full object-cover" />
               ) : (
                 <User className="w-6 h-6 text-white/50" />
               )}
            </div>
            <div className="min-w-0 text-left">
              <h2 className="text-sm font-bold truncate tracking-tight">
                {chat.type === 'group' ? (liveChat.name || "Security Group") : (otherProfile?.displayName || chat.participantDetails?.[chat.participants?.find((id: string) => id !== user?.uid)]?.name || "Secure Profile")}
              </h2>
              {quotaExceeded ? (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <p className="text-[9px] text-red-200 font-black uppercase tracking-tighter">Database Full (Read Only)</p>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full shadow-md ${isTyping ? 'bg-wa-green animate-pulse shadow-wa-green/50' : (isOtherOnline() || chat.type === 'group' ? 'bg-wa-green shadow-wa-green/30' : 'bg-slate-400')}`} />
                  <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest text-[#D1D7DB] dark:text-[#8696A0]">
                    {isTyping ? `${isTyping} is typing...` : (chat.type === 'group' ? `${chat.participants?.length} nodes synced` : (isOtherOnline() ? 'Online' : 'Offline'))}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold border border-white/10 backdrop-blur-sm">
              <CheckCircle2 className="w-3 h-3 text-wa-green" />
              Secure Sync Active
            </div>
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className={`p-2 rounded-full transition-all ${showMenu ? 'bg-white/20' : 'hover:bg-white/10'} opacity-70`}>
                <MoreVertical className="w-5 h-5" />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div initial={{ opacity: 0, scale: 0.9, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -20 }} className="absolute right-0 mt-2 w-56 bg-white dark:bg-wa-panel-dark text-slate-900 dark:text-slate-100 rounded-xl shadow-2xl overflow-hidden z-30 border border-slate-200 dark:border-slate-800">
                    <button onClick={() => { setShowInfo(true); setShowMenu(false); }} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-wa-panel-light/10 transition-colors">
                      <User className="w-4 h-4 text-wa-teal dark:text-wa-green" />
                      <span className="text-[13px] font-bold">Contact Info</span>
                    </button>
                    <button 
                      onClick={() => { toggleMute(chat.id); setShowMenu(false); }} 
                      className={`w-full flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-wa-panel-light/10 transition-colors ${profile?.mutedUsers?.includes(chat.id) ? 'text-red-500' : ''}`}
                    >
                      {profile?.mutedUsers?.includes(chat.id) ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                      <span className="text-[13px] font-bold">{profile?.mutedUsers?.includes(chat.id) ? 'Muted' : 'Mute Notifications'}</span>
                    </button>
                    <button onClick={toggleDisappearingMode} className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-wa-panel-light/10 transition-colors">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="text-[13px] font-bold uppercase tracking-tight">Disappearing Mode</span>
                        <span className={`text-[10px] font-black uppercase ${liveChat.disappearingMode ? 'text-wa-green' : 'text-zinc-500'}`}>
                          {liveChat.disappearingMode ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className={`w-11 h-6 rounded-full relative transition-all duration-300 ${liveChat.disappearingMode ? 'bg-wa-green' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                        <motion.div animate={{ x: liveChat.disappearingMode ? 22 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div 
          className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar relative z-0" 
          onScroll={handleScroll}
          ref={scrollRef}
        >
          {messages.map((msg) => {
            const isOwn = msg.senderId === user?.uid;
            const isSaved = msg.savedBy?.includes(user?.uid);
            return (
              <motion.div 
                key={msg.id} 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, msg });
                }}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group/msg relative`}
              >
                {!isOwn && (
                  <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 text-wa-teal opacity-0 group-hover/msg:opacity-100 transition-opacity pointer-events-none"
                    initial={{ x: -10 }}
                    whileInView={{ x: 0 }}
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </motion.div>
                )}
                
                <motion.div 
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0, right: 0.8 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x > 60) {
                      setReplyTo(msg);
                    }
                  }}
                  className={`message-bubble max-w-[85%] sm:max-w-[70%] ${isOwn ? 'message-out' : 'message-in'} ${isSaved ? 'ring-2 ring-wa-green ring-offset-2' : ''} p-1 overflow-hidden shadow-sm group relative cursor-grab active:cursor-grabbing select-none`}
                  onPointerDown={(e) => {
                    const clientX = e.clientX;
                    const clientY = e.clientY;
                    const timer = setTimeout(() => {
                      setContextMenu({ x: clientX, y: clientY, msg });
                    }, 500);
                    // Clear timer on up/move
                    const clear = () => {
                      clearTimeout(timer);
                      window.removeEventListener('pointerup', clear);
                      window.removeEventListener('pointermove', clear);
                    };
                    window.addEventListener('pointerup', clear);
                    window.addEventListener('pointermove', clear);
                  }}
                >
                  {msg.replyTo && (
                    <div className="mx-1 mt-1 mb-1 bg-black/5 dark:bg-white/5 rounded-lg border-l-4 border-wa-teal dark:border-wa-green p-2 text-[11px] opacity-80 cursor-pointer" onClick={() => {
                      const el = document.getElementById(`msg-${msg.replyTo.id}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      el?.classList.add('ring-2', 'ring-wa-teal', 'dark:ring-wa-green', 'transition-all', 'duration-1000');
                      setTimeout(() => el?.classList.remove('ring-2', 'ring-wa-teal', 'dark:ring-wa-green'), 2000);
                    }}>
                      <p className="font-black text-wa-teal dark:text-wa-green truncate">{msg.replyTo.senderName === (profile?.displayName || user?.displayName) ? 'You' : msg.replyTo.senderName}</p>
                      <p className="line-clamp-2 dark:text-slate-300">{msg.replyTo.type === 'image' ? '📷 Image' : msg.replyTo.content}</p>
                    </div>
                  )}
                  
                  {!isOwn && <p className="text-[10px] font-black text-wa-teal dark:text-wa-green mb-1 px-2 pt-1">{msg.senderName}</p>}
                  <div className="px-2 py-1" id={`msg-${msg.id}`}>
                    {msg.type === 'image' && (
                      <img 
                        src={msg.mediaUrl} 
                        className="rounded-lg mb-2 max-w-full h-auto border border-slate-100 dark:border-slate-800 cursor-zoom-in" 
                        referrerPolicy="no-referrer" 
                        onClick={() => setFullscreenMedia({ url: msg.mediaUrl, type: 'image' })}
                        onLoad={() => {
                          if (msg.timestamp?.toMillis() > Date.now() - 5000) {
                            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                          }
                        }}
                      />
                    )}
                    {msg.type === 'video' && (
                      <div className="relative group/vid cursor-pointer mb-2" onClick={() => setFullscreenMedia({ url: msg.mediaUrl, type: 'video' })}>
                        <video 
                          src={`${msg.mediaUrl}#t=0.1`} 
                          className="w-full max-h-60 object-cover rounded-lg border border-slate-100 dark:border-slate-800"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/vid:bg-black/40 transition-colors rounded-lg">
                          <Play className="w-12 h-12 text-white fill-current opacity-80" />
                        </div>
                      </div>
                    )}
                    {msg.type === 'file' && (
                      <a href={msg.mediaUrl} download={msg.fileName || 'file'} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-zinc-900/50 rounded-xl mb-2 border border-slate-200 dark:border-slate-800">
                        <div className="bg-wa-teal/10 p-2 rounded-lg"><Paperclip className="w-5 h-5 text-wa-teal dark:text-wa-green" /></div>
                        <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate dark:text-white uppercase tracking-tighter">{msg.fileName || 'Encrypted File'}</p></div>
                      </a>
                    )}
                    {msg.type === 'gif' && <img src={msg.mediaUrl} className="rounded-lg mb-2 max-w-full h-auto" referrerPolicy="no-referrer" />}
                    {renderMessageContent(msg)}
                  </div>
                  <div className="flex items-center justify-end gap-1 px-2 pb-1 opacity-60">
                    {msg.isEdited && <span className="text-[9px] italic font-medium mr-1">edited</span>}
                    <span className="text-[9px] uppercase font-bold tracking-tighter">{msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}</span>
                    {isOwn && <span className="text-blue-500 flex items-center">{msg.seenBy?.length > 1 ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}</span>}
                  </div>
                  <div className="absolute -right-2 top-0 translate-x-full flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                    <button onClick={() => setReplyTo(msg)} className="p-1 hover:text-wa-teal" title="Reply"><ChevronLeft className="w-3.5 h-3.5 rotate-180" /></button>
                    <button onClick={() => saveMessage(msg.id, isSaved)} className="p-1 hover:text-wa-green"><Save className={`w-3.5 h-3.5 ${isSaved ? 'fill-current text-wa-green' : 'text-slate-400'}`} /></button>
                    {isOwn && (
                      <>
                        <button onClick={() => startEditing(msg)} className="p-1 hover:text-wa-teal" title="Edit"><Save className="w-3.5 h-3.5 text-slate-400 rotate-90" /></button>
                        <button onClick={() => deleteMessage(msg.id)} className="p-1 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" /></button>
                      </>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-24 right-6 p-2 bg-wa-teal dark:bg-wa-green text-white dark:text-wa-dark-green rounded-full shadow-2xl z-10 border-2 border-white dark:border-zinc-900"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>

        <footer className="p-2 sm:p-3 bg-[#F0F2F5] dark:bg-[#111B21] transition-colors relative">
          {/* Reply Overlay */}
          <AnimatePresence>
            {replyTo && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 w-full bg-white dark:bg-[#111B21] border-t border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3 shadow-lg"
              >
                <div className="w-1 bg-wa-teal dark:bg-wa-green h-full absolute left-0 top-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-wa-teal dark:text-wa-green uppercase tracking-widest">{replyTo.senderName === (profile?.displayName || user?.displayName) ? 'You' : replyTo.senderName}</p>
                  <p className="text-xs dark:text-slate-300 truncate">{replyTo.content}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="p-2 text-slate-400 hover:text-red-500"><X className="w-5 h-5" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Edit Overlay */}
          <AnimatePresence>
            {editingMessage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 w-full bg-wa-teal/5 dark:bg-wa-green/5 border-t border-wa-teal dark:border-wa-green p-3 flex items-center gap-3 shadow-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-wa-teal dark:text-wa-green uppercase tracking-widest">Editing Message</p>
                  <p className="text-xs dark:text-slate-300 truncate">{editingMessage.content}</p>
                </div>
                <button onClick={() => { setEditingMessage(null); setMessage(''); }} className="p-2 text-slate-400 hover:text-red-500"><X className="w-5 h-5" /></button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* GIF Picker Overlay */}
          <AnimatePresence>
            {showGifs && (
               <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className="absolute bottom-full left-0 w-full bg-white dark:bg-[#111B21] border-t border-slate-200 dark:border-slate-800 z-20 h-[300px] flex flex-col p-4 gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black italic text-wa-teal dark:text-wa-green uppercase tracking-widest text-xs">GIF Search</h3>
                    <button onClick={() => setShowGifs(false)} className="text-slate-400 hover:text-red-500"><X className="w-5 h-5"/></button>
                  </div>
                  <input type="text" placeholder="Seach GIFs..." value={gifSearch} onChange={(e) => setGifSearch(e.target.value)} className="w-full bg-slate-100 dark:bg-zinc-900 border-none rounded-xl px-4 py-2 text-sm focus:outline-none dark:text-white" />
                  <div className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-4 no-scrollbar pb-2">
                     {gifs.map(gif => (
                       <button key={gif.id} onClick={() => sendMessage(undefined, { type: 'gif', url: gif.images.fixed_height.url, content: 'Sent a GIF' })} className="flex-shrink-0 h-full aspect-square rounded-xl overflow-hidden hover:scale-105 transition-transform border border-slate-100 dark:border-slate-800">
                         <img src={gif.images.fixed_height.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                       </button>
                     ))}
                  </div>
               </motion.div>
            )}
          </AnimatePresence>

          {/* Attachment Menu */}
          <AnimatePresence>
            {showAttachMenu && (
              <motion.div initial={{ opacity: 0, scale: 0.8, y: 50 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 50 }} className="absolute bottom-20 left-12 w-48 bg-white dark:bg-wa-panel-dark rounded-[2rem] shadow-2xl z-50 p-3 flex flex-col gap-2 border border-slate-200 dark:border-slate-800">
                {[
                  { label: 'Photos', icon: ImageIcon, color: 'bg-emerald-500', accept: 'image/*' },
                  { label: 'Videos', icon: Play, color: 'bg-blue-500', accept: 'video/*' },
                  { label: 'Documents', icon: FileText, color: 'bg-orange-500', accept: 'application/pdf,.doc,.docx,.txt' },
                ].map(opt => (
                  <button key={opt.label} onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = opt.accept; fileInputRef.current.click(); } setShowAttachMenu(false); }} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors w-full">
                    <div className={`${opt.color} p-2 rounded-xl text-white`}><opt.icon className="w-4 h-4" /></div>
                    <span className="text-xs font-bold dark:text-slate-200">{opt.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={sendMessage} className="flex items-center gap-1.5 sm:gap-2 max-w-5xl mx-auto">
            <div className="flex items-center bg-white dark:bg-[#2A3942] rounded-full px-3 sm:px-4 py-2 flex-1 shadow-sm border border-slate-200 dark:border-none">
              <div className="flex items-center gap-1.5 mr-3 border-r border-slate-100 dark:border-slate-700 pr-3">
                <button type="button" onClick={() => { setShowEmoji(!showEmoji); setShowGifs(false); setShowAttachMenu(false); }} className="text-slate-500 dark:text-slate-400 hover:text-wa-teal transition-colors"><Smile className="w-5 h-5" /></button>
                <button type="button" onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmoji(false); setShowGifs(false); }} className={`p-1.5 rounded-full transition-all ${showAttachMenu ? 'bg-wa-teal/10 text-wa-teal' : 'text-slate-500 dark:text-slate-400 hover:text-wa-teal'}`}><Paperclip className="w-5 h-5 -rotate-45" /></button>
                <button type="button" onClick={() => { setShowGifs(!showGifs); setShowEmoji(false); setShowAttachMenu(false); }} className="text-slate-500 dark:text-slate-400 hover:text-wa-teal transition-colors"><Gift className="w-5 h-5" /></button>
              </div>
              <input 
                type="text" 
                value={message} 
                onChange={(e) => setMessage(e.target.value)} 
                placeholder={quotaExceeded ? "Database Full - READ ONLY" : "Type a message node..."} 
                disabled={quotaExceeded}
                className={`flex-1 bg-transparent border-none focus:outline-none text-[16px] md:text-sm dark:text-white ${quotaExceeded ? 'cursor-not-allowed opacity-50 italic' : ''}`} 
              />
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            </div>
            <button 
              type="submit" 
              disabled={(!message.trim() && !uploading) || quotaExceeded} 
              className="bg-wa-teal dark:bg-wa-green p-3 rounded-full text-white dark:text-wa-dark-green hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
          <AnimatePresence>
            {showEmoji && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden">
                <EmojiPicker theme={theme as any} onEmojiClick={(emojiData) => setMessage(prev => prev + emojiData.emoji)} width={320} height={400} />
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      </div>

      {/* Info Sidebar */}
      <AnimatePresence>
        {showInfo && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="absolute top-0 right-0 w-full sm:w-[380px] h-full bg-wa-panel-light dark:bg-wa-panel-dark border-l border-slate-200 dark:border-slate-800 z-50 overflow-y-auto no-scrollbar shadow-2xl transition-colors flex flex-col">
            <div className="h-16 bg-wa-teal dark:bg-wa-panel-dark flex items-center justify-between px-6 text-white sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowInfo(false)} className="p-1 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
                <h3 className="font-bold text-sm uppercase tracking-widest leading-none">Node Intel</h3>
              </div>
              {chat.type === 'group' && liveChat.admins?.includes(user?.uid!) && (
                <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-full ${showSettings ? 'bg-white/20' : 'hover:bg-white/10'} transition-all`}><MoreVertical className="w-4 h-4" /></button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
              <div className="flex flex-col items-center py-10 bg-white dark:bg-wa-panel-light/5 border-b border-slate-100 dark:border-slate-800/50">
                <div 
                  className="w-40 h-40 rounded-full overflow-hidden mb-6 border-4 border-white dark:border-wa-panel-dark shadow-2xl cursor-zoom-in"
                  onClick={() => setFullscreenMedia({ url: liveChat.groupPic || chat.profilePic || otherProfile?.profilePic, type: 'image' })}
                >
                   {(liveChat.groupPic || chat.profilePic || otherProfile?.profilePic) ? (
                     <img src={liveChat.groupPic || chat.profilePic || otherProfile?.profilePic} alt="" className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center bg-wa-teal/10"><User className="w-16 h-16 text-wa-teal/30" /></div>
                   )}
                </div>
                <h2 className="text-xl font-black dark:text-white uppercase tracking-tight text-center px-4">
                  {chat.type === 'group' ? (liveChat.name || "Direct Group") : (otherProfile?.displayName || chat.participantDetails?.[chat.participants?.find((id: string) => id !== user?.uid)]?.name || "Secure Node")}
                </h2>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className={`w-2 h-2 rounded-full ${isOtherOnline() ? 'bg-wa-green animate-pulse shadow-md shadow-wa-green/50' : 'bg-slate-400'}`} />
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">{isOtherOnline() ? 'Protocol Active' : 'Node Offline'}</span>
                </div>
              </div>

              {showSettings && chat.type === 'group' && (
                <div className="p-6 space-y-6 bg-wa-green/5 border-b border-slate-100 dark:border-slate-800/30">
                  <div className="space-y-4">
                    <label className="text-[9px] font-black uppercase tracking-widest text-wa-green">Channel Branding</label>
                    <div className="flex gap-2">
                      <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} placeholder="Rename Protocol..." className="flex-1 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-xs" />
                      <button onClick={updateGroupBranding} className="bg-wa-green text-wa-dark-green px-4 py-2 rounded-xl text-[10px] font-black shadow-lg shadow-wa-green/20">SYNC</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-wa-green">Access Governance</label>
                    <button onClick={async () => { await updateDoc(doc(db, 'chats', chat.id), { restricted: !liveChat.restricted }); }} className={`w-full p-4 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${liveChat.restricted ? 'bg-wa-green/20 border-wa-green text-wa-dark-green' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-slate-800 text-slate-400'}`}>
                      {liveChat.restricted ? 'Admins Only Logic Enforced' : 'Open Collaboration Protocol'}
                    </button>
                  </div>
                </div>
              )}

              {chat.type === 'group' && (
                <div className="p-6 border-b border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green flex items-center gap-2">
                      <Users className="w-4 h-4 opacity-40" /> Authorized Nodes ({chat.participants?.length})
                    </h4>
                    {(liveChat.admins?.includes(user?.uid!) || !liveChat.restricted) && (
                      <button onClick={() => setShowAddNode(!showAddNode)} className="p-1.5 bg-wa-teal/10 text-wa-teal rounded-full hover:bg-wa-teal hover:text-white transition-all shadow-sm" title="Add Node"><UserPlus className="w-4 h-4" /></button>
                    )}
                  </div>
                  {showAddNode && (
                    <div className="mb-6 space-y-3 p-4 bg-slate-50 dark:bg-zinc-900/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Available Nodes</p>
                      {friends.filter(f => !chat.participants?.includes(f.uid)).length === 0 ? (
                        <p className="text-[10px] text-zinc-400 italic">No available friends to sync.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto no-scrollbar space-y-2">
                          {friends.filter(f => !chat.participants?.includes(f.uid)).map(f => (
                            <div key={f.id} className="flex items-center justify-between p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors group cursor-pointer" onClick={() => addNodeToGroup(f)}>
                               <div className="flex items-center gap-2">
                                 <img src={f.profilePic || f.pic} className="w-8 h-8 rounded-full border border-slate-200" />
                                 <span className="text-xs font-bold dark:text-slate-200 truncate">{f.displayName || f.name}</span>
                               </div>
                               <UserPlus className="w-3 h-3 text-wa-teal opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-5">
                    {chat.participants?.map((pid: string) => {
                      const p = participantsProfiles[pid] || (chat.participantDetails?.[pid] || {});
                      const isMe = pid === user?.uid;
                      const isAdmin = liveChat.admins?.includes(pid);
                      const isCurrentOnline = p.status === 'online';
                      return (
                        <div key={pid} className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <img src={p.profilePic || p.pic} className="w-11 h-11 rounded-full object-cover shadow-inner border border-slate-100 dark:border-slate-800" />
                              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-white dark:border-[#111B21] rounded-full shadow-sm ${isCurrentOnline ? 'bg-wa-green' : 'bg-slate-300'}`} />
                            </div>
                            <div className="min-w-0">
                               <div className="flex items-center gap-2">
                                 <p className="text-sm font-bold dark:text-slate-100 truncate">{p.displayName || p.name || 'Protocol Node'}</p>
                                 {isAdmin && <span className="text-[8px] bg-wa-green/10 text-wa-green px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">ADMIN</span>}
                               </div>
                               <p className="text-[10px] text-zinc-500 flex items-center gap-2 font-black uppercase tracking-tighter mt-0.5">
                                 {p.protocolId || p.handle ? `@${p.protocolId || p.handle}` : 'ANONYMOUS'} • {p.age ? `${p.age} CYCLES` : 'AGE N/A'}
                               </p>
                            </div>
                          </div>
                          {!isMe && liveChat.admins?.includes(user?.uid!) && !isAdmin && (
                            <button onClick={() => promoteAdmin(pid)} className="opacity-0 group-hover:opacity-100 bg-wa-teal text-white px-3 py-1.5 rounded-xl text-[9px] font-black hover:bg-wa-green shadow-xl transition-all uppercase tracking-widest">Promote</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="p-6 space-y-6">
                {chat.type !== 'group' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green">Bio / Signature</label>
                      <p className="text-sm dark:text-slate-300 leading-relaxed italic opacity-80">"{otherProfile?.bio || "No status cryptographic signature provided."}"</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm">
                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Gender</label>
                        <span className="text-sm font-bold dark:text-slate-200">{otherProfile?.gender || "Unknown"}</span>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm">
                        <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Vetted Age</label>
                        <span className="text-sm font-bold dark:text-slate-200">{otherProfile?.age || "???"} YRS</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-wa-teal dark:text-wa-green opacity-70">Protocol Visuals</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'minimal', label: 'Classic', color: 'bg-[#E5DDD5]' },
                      { id: 'green', label: 'Protocol Green', color: 'bg-[#075E54]' },
                      { id: 'black', label: 'Deep Night', color: 'bg-black' },
                      { id: 'teal', label: 'Cyber Teal', color: 'bg-wa-teal' }
                    ].map(bg => (
                      <button key={bg.id} onClick={() => setChatBackground(bg.id as any)} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${chatBackground === bg.id ? 'border-wa-teal dark:border-wa-green bg-white dark:bg-zinc-800 shadow-xl' : 'border-slate-100 dark:border-slate-800/50 hover:border-slate-200'}`}>
                        <div className={`w-full h-10 rounded-xl ${bg.color} shadow-inner`}></div>
                        <span className="text-[9px] font-black uppercase tracking-widest">{bg.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-10">
                  <button onClick={deleteChat} disabled={isDeleting} className="w-full h-16 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-[2rem] flex items-center justify-center gap-3 transition-all font-black uppercase tracking-[0.2em] text-[11px] border-2 border-red-500/20 shadow-xl shadow-red-500/10 active:scale-95">
                    {isDeleting ? 'Erasing History...' : 'Wipe Channel Sync'}<Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {contextMenu && (
          <div 
            className="fixed inset-0 z-[110]" 
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="absolute bg-white dark:bg-[#233138] shadow-2xl rounded-2xl border border-slate-200 dark:border-white/5 py-2 min-w-[180px] overflow-hidden"
              style={{ 
                left: Math.max(10, Math.min(contextMenu.x, window.innerWidth - 200)), 
                top: Math.max(10, Math.min(contextMenu.y, window.innerHeight - 250)) 
              }}
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm font-medium dark:text-white"
              >
                <ChevronLeft className="w-4 h-4 rotate-180" /> Reply
              </button>
              <button 
                onClick={() => copyToClipboard(contextMenu.msg.content)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm font-medium dark:text-white"
              >
                <FileText className="w-4 h-4" /> Copy
              </button>
              {contextMenu.msg.senderId === user?.uid && (
                <button 
                  onClick={() => startEditing(contextMenu.msg)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm font-medium dark:text-white"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
              )}
              <button 
                onClick={() => { saveMessage(contextMenu.msg.id, contextMenu.msg.savedBy?.includes(user?.uid)); setContextMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm font-medium dark:text-white"
              >
                <Save className="w-4 h-4" /> Save
              </button>
              <div className="h-px bg-slate-100 dark:bg-white/5 my-1" />
              <button 
                onClick={() => { deleteMessage(contextMenu.msg.id); setContextMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition-colors text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </motion.div>
          </div>
        )}

        {fullscreenMedia && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setFullscreenMedia(null)}
          >
            <button 
              onClick={() => setFullscreenMedia(null)} 
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white z-[130] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl max-h-[85vh] w-full flex items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              {fullscreenMedia.type === 'image' ? (
                <img 
                  src={fullscreenMedia.url} 
                  className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-lg" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="w-full aspect-video max-w-4xl bg-black rounded-lg overflow-hidden shadow-2xl">
                  <Player 
                    url={fullscreenMedia.url} 
                    width="100%" 
                    height="100%" 
                    controls 
                    playing 
                  />
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
