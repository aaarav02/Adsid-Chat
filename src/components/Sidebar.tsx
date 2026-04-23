import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactPlayer from 'react-player';
import { Search, Users, UserPlus, LogOut, MessageSquare, Plus, Bell, User, Sun, Moon, Compass, CheckCircle2, CheckCheck, Trash2, ShieldAlert, X, Check, Settings, Palette, Cloud, BellOff, Camera, Play, ChevronLeft } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { useChat } from '../contexts/ChatContext';
import { useTheme } from '../contexts/ThemeContext';
import { collection, query, where, onSnapshot, getDocs, getDoc, addDoc, serverTimestamp, doc, updateDoc, limit, deleteDoc, writeBatch, setDoc, orderBy } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';

const Player = ReactPlayer as any;

interface SidebarProps {
  onChatSelect: (chat: any) => void;
  selectedChatId?: string;
}

export default function Sidebar({ onChatSelect, selectedChatId }: SidebarProps) {
  const { user, profile, appConfig, updateAppConfig, toggleMute } = useChat();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'chats' | 'friends' | 'requests' | 'search' | 'discover' | 'settings'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
  const [uploadingPic, setUploadingPic] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', members: [] as string[] });
  
  const [adminConfig, setAdminConfig] = useState(appConfig);
  const [settingsTab, setSettingsTab] = useState<'main' | 'admin'>('main');

  useEffect(() => {
    setAdminConfig(appConfig);
  }, [appConfig]);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-tab', handleSwitchTab);
  }, []);

  const isAdmin = user?.email === 'c4rush.com@gmail.com' || user?.email === 'extremear762@gmail.com';

  const handleCleanDatabase = async () => {
    if (!isAdmin) return;
    if (!confirm("Are you ABSOLUTELY sure? This will delete ALL chats, messages, and friend requests for everyone. This cannot be undone.")) return;
    
    setIsCleaning(true);
    try {
      const batch = writeBatch(db);
      const reqs = await getDocs(collection(db, 'friendRequests'));
      reqs.forEach(d => batch.delete(d.ref));
      const chatsSnap = await getDocs(collection(db, 'chats'));
      for (const chatDoc of chatsSnap.docs) {
        const msgs = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
        msgs.forEach(m => batch.delete(m.ref));
        batch.delete(chatDoc.ref);
      }
      await batch.commit();
      alert("Database wiped successfully.");
    } catch (err) {
      console.error(err);
      alert("Cleanup failed.");
    } finally {
      setIsCleaning(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
    return onSnapshot(q, (snapshot) => {
      setChats(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'friendRequests'), where('toId', '==', user.uid), where('status', '==', 'pending'));
    return onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'friends'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setFriends(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user]);

  const isUserOnline = (uid: string) => {
    const p = userProfiles[uid];
    if (!p || p.status !== 'online') return false;
    const now = Date.now();
    let lastSeenMillis = 0;
    try {
      if (p.lastSeen?.toMillis) lastSeenMillis = p.lastSeen.toMillis();
      else if (p.lastSeen?.seconds) lastSeenMillis = p.lastSeen.seconds * 1000;
    } catch (e) { return true; }
    return (now - lastSeenMillis) < 90000; // Threshold twice the heartbeat to prevent flickering
  };

  const trackedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const allIds = new Set<string>();
    chats.forEach(c => c.participants?.forEach((p: string) => { if (p !== user.uid) allIds.add(p); }));
    friends.forEach(f => { if (f.uid) allIds.add(f.uid); });
    const newIds = Array.from(allIds).filter(id => !trackedIds.current.has(id));
    if (newIds.length === 0) return;
    newIds.forEach(id => {
      trackedIds.current.add(id);
      onSnapshot(doc(db, 'users', id), (snap) => {
        if (snap.exists()) setUserProfiles(prev => ({ ...prev, [id]: snap.data() }));
      });
    });
  }, [chats, friends, user]);

  useEffect(() => {
    if (!user || activeTab !== 'discover') return;
    const fetchConnections = async () => {
      const connections = new Set<string>();
      const chatSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid)));
      chatSnap.docs.forEach(d => d.data().participants?.forEach((p: string) => connections.add(p)));
      const reqSnapSent = await getDocs(query(collection(db, 'friendRequests'), where('fromId', '==', user.uid)));
      reqSnapSent.docs.forEach(d => connections.add(d.data().toId));
      const reqSnapRecv = await getDocs(query(collection(db, 'friendRequests'), where('toId', '==', user.uid)));
      reqSnapRecv.docs.forEach(d => connections.add(d.data().fromId));

      const q = query(collection(db, 'users'), where('status', '==', 'online'), limit(100));
      return onSnapshot(q, (snapshot) => {
        const now = Date.now();
        setDiscoverUsers(snapshot.docs.map(doc => doc.data()).filter(u => {
          if (u.uid === user.uid || connections.has(u.uid)) return false;
          let lastSeenMillis = 0;
          try {
            if (u.lastSeen?.toMillis) lastSeenMillis = u.lastSeen.toMillis();
            else if (u.lastSeen?.seconds) lastSeenMillis = u.lastSeen.seconds * 1000;
          } catch (e) { lastSeenMillis = now; }
          return (now - lastSeenMillis) < 90000; // Threshold twice the heartbeat
        }));
      });
    };
    fetchConnections();
  }, [user, activeTab]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    const connections = new Set<string>();
    const chatSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid)));
    chatSnap.docs.forEach(d => d.data().participants?.forEach((p: string) => connections.add(p)));
    const qName = query(collection(db, 'users'), where('displayName', '>=', searchQuery), where('displayName', '<=', searchQuery + '\uf8ff'));
    const qHandle = query(collection(db, 'users'), where('protocolId', '==', searchQuery.startsWith('@') ? searchQuery.slice(1) : searchQuery));
    const [snapName, snapHandle] = await Promise.all([getDocs(qName), getDocs(qHandle)]);
    const combined = [...snapName.docs, ...snapHandle.docs];
    const uniqueResults = Array.from(new Set(combined.map(d => d.id))).map(id => combined.find(d => d.id === id)?.data());
    setSearchResults(uniqueResults.filter(u => u.uid !== user?.uid && !connections.has(u.uid)));
  };

  const sendFriendRequest = async (targetUser: any) => {
    if (!user) return;
    const q = query(collection(db, 'friendRequests'), where('fromId', '==', user.uid), where('toId', '==', targetUser.uid));
    const snap = await getDocs(q);
    if (!snap.empty) { alert("Request already pending."); return; }
    await addDoc(collection(db, 'friendRequests'), {
      fromId: user?.uid, fromName: profile?.displayName, fromPic: profile?.profilePic,
      toId: targetUser.uid, status: 'pending', timestamp: serverTimestamp()
    });
    alert("Request Sent!");
  };

  const acceptRequest = async (req: any) => {
    if (!user) return;
    await addDoc(collection(db, 'chats'), {
      type: 'individual', participants: [user.uid, req.fromId],
      participantDetails: { [user.uid]: { name: profile?.displayName, pic: profile?.profilePic }, [req.fromId]: { name: req.fromName, pic: req.fromPic } },
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'users', user.uid, 'friends', req.fromId), { uid: req.fromId, displayName: req.fromName, profilePic: req.fromPic, timestamp: serverTimestamp() });
    await setDoc(doc(db, 'users', req.fromId, 'friends', user.uid), { uid: user.uid, displayName: profile?.displayName, profilePic: profile?.profilePic, timestamp: serverTimestamp() });
    await deleteDoc(doc(db, 'friendRequests', req.id));
  };

  const startChat = async (friend: any) => {
    if (!user) return;
    const q = query(collection(db, 'chats'), where('type', '==', 'individual'), where('participants', 'array-contains', user.uid));
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => d.data().participants.includes(friend.uid));
    if (existing) onChatSelect({ id: existing.id, ...existing.data() });
    else {
      const newChat = await addDoc(collection(db, 'chats'), {
        type: 'individual', participants: [user.uid, friend.uid],
        participantDetails: { [user.uid]: { name: profile?.displayName, pic: profile?.profilePic }, [friend.uid]: { name: friend.displayName, pic: friend.profilePic } },
        createdAt: serverTimestamp()
      });
      onChatSelect({ id: newChat.id, participants: [user.uid, friend.uid] });
    }
    setActiveTab('chats');
  };

  const createGroup = async () => {
    if (!groupForm.name || groupForm.members.length === 0) { alert("Group name and member required"); return; }
    const participants = [user?.uid, ...groupForm.members];
    const participantDetails: Record<string, any> = { [user?.uid!]: { name: profile?.displayName, pic: profile?.profilePic, handle: profile?.protocolId } };
    groupForm.members.forEach(id => {
      const p = userProfiles[id] || friends.find(f => f.uid === id);
      participantDetails[id] = { name: p?.displayName || p?.name, pic: p?.profilePic || p?.pic, handle: p?.protocolId || p?.handle };
    });
    await addDoc(collection(db, 'chats'), {
      type: 'group', name: groupForm.name, participants, participantDetails, admins: [user?.uid], restricted: true, createdAt: serverTimestamp(),
      lastMessage: { content: "Group Created", senderId: 'system', timestamp: serverTimestamp() }
    });
    setShowGroupModal(false);
    setGroupForm({ name: '', members: [] });
  };

  return (
    <>
    <div className="h-full flex flex-col bg-wa-panel-light dark:bg-wa-panel-dark border-r border-slate-200 dark:border-slate-800 transition-colors">
      {/* Header - WhatsApp Green/Teal */}
      <div className="bg-wa-teal dark:bg-wa-panel-dark p-4 flex flex-col gap-4 text-white dark:text-slate-200 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border border-white/20">
              {profile?.profilePic ? (
                <img src={profile.profilePic} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">{profile?.displayName || "User"}</h2>
              <p className="text-[10px] opacity-70">Adsid Secure Sync</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-full transition-all ${activeTab === 'settings' ? 'bg-white/20 text-wa-green' : 'hover:bg-white/10'}`}
              title="Global Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button onClick={() => setShowGroupModal(true)} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/80 hover:text-wa-green" title="Create Secure Group">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (setActiveTab('search'), handleSearch())}
            className="w-full bg-white/10 dark:bg-zinc-900 border-none rounded-lg px-8 py-2 text-xs focus:outline-none focus:bg-white/20 dark:focus:bg-zinc-800 transition-all text-white placeholder:text-white/50"
          />
        </div>
      </div>

      {/* Tabs - WhatsApp Style Icons/Text */}
      <div className="flex items-center bg-wa-teal dark:bg-wa-panel-dark text-white shadow-inner relative">
        {[
          { id: 'chats', icon: MessageSquare, label: 'Chats' },
          { id: 'friends', icon: Users, label: 'Friends' },
          { id: 'discover', icon: Compass, label: 'Discover' },
          { id: 'requests', icon: Bell, label: 'Requests', count: requests.length },
        ].map((tab: any) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); }}
            className={`flex-1 flex flex-col items-center gap-1 py-2 text-[9px] font-bold uppercase tracking-wider transition-all relative ${
              activeTab === tab.id ? 'text-wa-green' : 'text-white/60 hover:text-white'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'scale-110' : ''} transition-transform`} />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count ? (
              <span className="absolute top-1 right-2 bg-wa-green text-wa-dark-green text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full">
                {tab.count}
              </span>
            ) : null}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-wa-green rounded-t-full shadow-[0_0_8px_rgba(37,211,102,0.5)]" />
            )}
          </button>
        ))}
      </div>

      {/* Group Creation Modal */}
      <AnimatePresence>
        {showGroupModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-wa-panel-dark w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="bg-wa-teal dark:bg-zinc-900 p-6 flex items-center justify-between text-white">
                <h3 className="font-black uppercase tracking-widest text-sm">Assemble Direct Group</h3>
                <button onClick={() => setShowGroupModal(false)}><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green">Channel Alias</label>
                  <input 
                    type="text"
                    placeholder="e.g. Protocol Alpha"
                    value={groupForm.name}
                    onChange={e => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl py-4 px-6 text-slate-900 dark:text-white focus:outline-none focus:border-wa-green transition-all"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green">Authorized Nodes ({groupForm.members.length})</label>
                  <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 no-scrollbar">
                    {friends.map(f => {
                       const isSelected = groupForm.members.includes(f.uid);
                       return (
                         <button
                           key={f.uid}
                           onClick={() => {
                             setGroupForm(prev => ({
                               ...prev,
                               members: isSelected 
                                 ? prev.members.filter(id => id !== f.uid)
                                 : [...prev.members, f.uid]
                             }));
                           }}
                           className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all border ${
                             isSelected ? 'bg-wa-green/10 border-wa-green shadow-sm' : 'bg-slate-50 dark:bg-zinc-950/50 border-transparent hover:border-slate-300'
                           }`}
                         >
                           <div className="flex items-center gap-3">
                             <img src={f.profilePic} className="w-8 h-8 rounded-full" />
                             <span className="text-sm font-bold dark:text-slate-200">{f.displayName}</span>
                           </div>
                           <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                             isSelected ? 'bg-wa-green border-wa-green' : 'border-slate-300'
                           }`}>
                             {isSelected && <Check className="w-3 h-3 text-white" />}
                           </div>
                         </button>
                       );
                    })}
                  </div>
                </div>

                <button
                  onClick={createGroup}
                  disabled={!groupForm.name || groupForm.members.length === 0}
                  className="w-full bg-wa-green text-wa-dark-green font-black py-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-wa-green/20"
                >
                  INITIALIZE SECURE GROUP
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar bg-white dark:bg-[#0B141A] transition-colors">
        {activeTab === 'chats' && (chats.length > 0 ? (
          chats.map(chat => {
            const otherParticipantId = chat.participants?.find((p: string) => p !== user?.uid);
            const profileData = userProfiles[otherParticipantId] || {};
            const participantData = chat.participantDetails?.[otherParticipantId] || {};
            
            // Priority: Stored name -> Fetched profile -> Fallback placeholder
            const chatName = chat.name || profileData.displayName || profileData.name || participantData.name || (chat.type === 'individual' ? `AdSid User` : "Direct Message");
            
            // Aggressive DP lookup: check profile first, then participant, then chat doc
            const chatPic = chat.type === 'group' 
              ? (chat.groupPic || chat.profilePic || null) 
              : (profileData.profilePic || profileData.photoURL || profileData.pic || participantData.pic || participantData.profilePic || chat.profilePic || null);
            
            return (
              <button
                key={chat.id}
                onClick={() => onChatSelect(chat)}
                className={`w-full flex items-center gap-4 p-3 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${
                  selectedChatId === chat.id ? 'bg-slate-100 dark:bg-zinc-800/50' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30'
                }`}
              >
                <div className="relative">
                  <div 
                    className="w-12 h-12 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex items-center justify-center border border-slate-100 dark:border-zinc-700 cursor-zoom-in"
                    onClick={(e) => { e.stopPropagation(); if (chatPic) setFullscreenImage(chatPic); }}
                  >
                    {chatPic ? (
                      <img src={chatPic} className="w-full h-full object-cover" />
                    ) : (
                      chat.type === 'group' ? <Users className="w-6 h-6 text-slate-400" /> : <User className="text-wa-teal/40 w-6 h-6" />
                    )}
                  </div>
                  {chat.type !== 'group' && (
                    <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-white dark:border-zinc-950 rounded-full ${isUserOnline(otherParticipantId) ? 'status-online' : 'bg-slate-400'}`}></div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <h4 className="text-[13px] font-semibold truncate dark:text-slate-200">{chatName}</h4>
                      {profile?.mutedUsers?.includes(chat.id) && <BellOff className="w-2.5 h-2.5 text-red-500 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {chat.lastMessage?.timestamp ? formatDistanceToNow(chat.lastMessage.timestamp.toDate()) : ''}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-400 dark:text-zinc-500 truncate leading-relaxed flex items-center gap-1">
                    {chat.lastMessage?.senderId === user?.uid && (
                      <CheckCheck className={`w-3 h-3 ${chat.lastMessage?.seen ? 'text-blue-500' : 'text-zinc-400'}`} />
                    )}
                    {chat.lastMessage?.content || "Tap to start conversation"}
                  </p>
                </div>
              </button>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 p-8 text-center">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm">No chats yet.<br/>Discover online users to start chatting!</p>
          </div>
        ))}

        {activeTab === 'discover' && (
          <div className="p-4 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green/60 mb-2">Protocol Discovery</h3>
            
            {/* Advertisement Node (Global) */}
            {appConfig.adNode?.enabled && (
              <button 
                onClick={() => onChatSelect({ isSponsored: true, id: 'sponsored_node', ...appConfig.adNode })}
                className="w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-slate-200 dark:border-zinc-800 relative overflow-hidden group text-left transition-all active:scale-[0.98] hover:shadow-wa-green/10"
              >
                {appConfig.adNode.image && (
                  <div className="w-full h-32 relative overflow-hidden">
                    <img 
                      src={appConfig.adNode.image} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4">
                       <span className="bg-wa-green text-wa-dark-green text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-widest">Sponsored Node</span>
                       <h4 className="text-white text-sm font-bold mt-1 line-clamp-1">{appConfig.adNode.name}</h4>
                    </div>
                  </div>
                )}
                
                <div className="p-4 relative">
                   <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                          {appConfig.adNode.description || "Official protocol broadcast. Tap to enter secure node."}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-wa-green/10 flex items-center justify-center shrink-0 group-hover:bg-wa-green transition-all">
                        <Play className="w-3.5 h-3.5 text-wa-green group-hover:text-wa-dark-green fill-current" />
                      </div>
                   </div>
                   
                   {appConfig.adNode.link && (
                     <div className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-wa-teal dark:text-wa-green uppercase tracking-wider">
                       <Compass className="w-3 h-3" />
                       Visit Protocol Site
                     </div>
                   )}
                </div>

                <div className="absolute top-2 right-2 p-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                   <X className="w-3 h-3 text-white" />
                </div>
              </button>
            )}
            
            <div className="pt-2">
              <p className="text-[11px] text-zinc-500 font-medium px-2 leading-relaxed">
                Scan public nodes to expand your secure network. Sponsored nodes provide official updates and media streams.
              </p>
            </div>

            <h3 className="text-[10px] font-black uppercase tracking-widest text-wa-teal dark:text-wa-green/60 px-1 mb-1 mt-2">
              Online Sync Nodes
            </h3>
            {discoverUsers.length > 0 ? (
              discoverUsers.map(u => (
                <div key={u.uid} className="bg-slate-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between shadow-sm transition-all hover:shadow-md hover:border-wa-green/30 group">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img src={u.profilePic || u.photoURL} className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-zinc-800 shadow-sm" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-wa-green border-2 border-white dark:border-zinc-900 rounded-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-bold truncate dark:text-slate-100">{u.displayName}</p>
                          <CheckCircle2 className="w-3 h-3 text-blue-500 fill-blue-500/10" />
                        </div>
                        <p className="text-[9px] text-wa-green font-black uppercase tracking-tighter">Online User</p>
                      </div>
                      <p className="text-[10px] text-zinc-500 line-clamp-1 italic">"{u.bio || "Secure end-to-end messaging"}"</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => sendFriendRequest(u)} 
                    className="bg-wa-green text-wa-dark-green p-2.5 rounded-full hover:bg-wa-teal hover:text-white transition-all transform group-hover:rotate-12 shadow-lg shadow-wa-green/20"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center opacity-40 grayscale">
                <Compass className="w-12 h-12 mb-4" />
                <p className="text-xs font-bold leading-relaxed">No other online users found.<br/>Note: You must use different accounts to see each other.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'requests' && requests.map(req => (
          <div key={req.id} className="p-4 bg-wa-light-green/20 dark:bg-wa-bubble-out-dark/10 rounded-2xl border border-wa-light-green/30 dark:border-wa-bubble-out-dark/30 flex items-center justify-between mb-2 mx-3 mt-2 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden border-2 border-white dark:border-zinc-800">
                {req.fromPic ? <img src={req.fromPic} alt="" className="w-full h-full object-cover" /> : <Users className="p-2 text-slate-400" />}
              </div>
              <div>
                <p className="text-sm font-bold dark:text-slate-100">{req.fromName}</p>
                <p className="text-[10px] text-wa-teal dark:text-wa-green mt-1 font-bold">Wants to Chat</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => acceptRequest(req)}
                className="bg-wa-teal dark:bg-wa-green text-white dark:text-wa-dark-green p-2.5 rounded-full hover:scale-110 transition-all shadow-md"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {activeTab === 'search' && searchResults.map(u => (
          <div key={u.uid} className="p-4 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between mb-2 mx-3 mt-2">
             <div className="flex items-center gap-3">
              <img src={u.profilePic || u.photoURL} className="w-12 h-12 rounded-full object-cover shadow-sm" />
              <div>
                <p className="text-sm font-bold dark:text-slate-100">{u.displayName}</p>
                <p className="text-[11px] text-zinc-500 line-clamp-1">{u.bio || "No status set"}</p>
              </div>
            </div>
            <button onClick={() => sendFriendRequest(u)} className="p-2.5 bg-wa-green text-wa-dark-green rounded-full hover:bg-wa-teal hover:text-white transition-all shadow-md">
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
        ))}

        { activeTab === 'friends' && (
            <div className="p-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-wa-teal dark:text-wa-green/60 px-1 mb-2">Authenticated Nodes</h3>
              {friends.length > 0 ? (
                friends.map(f => {
                  const p = userProfiles[f.uid] || f;
                  return (
                    <button
                      key={f.id}
                      onClick={() => startChat(f)}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl mb-2 hover:bg-wa-green/10 transition-colors border border-slate-100 dark:border-zinc-800 shadow-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="relative cursor-zoom-in group/dp"
                          onClick={(e) => { e.stopPropagation(); setFullscreenImage(p.profilePic); }}
                        >
                          <img src={p.profilePic} className="w-10 h-10 rounded-full object-cover ring-2 ring-transparent group-hover/dp:ring-wa-green/30 transition-all shadow-sm" />
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${isUserOnline(f.uid) ? 'bg-wa-green' : 'bg-slate-400'}`} />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-bold dark:text-slate-200">{p.displayName}</p>
                            {profile?.mutedUsers?.includes(f.uid) && <BellOff className="w-2.5 h-2.5 text-red-500" />}
                          </div>
                          <p className={`text-[9px] font-black uppercase tracking-tighter ${isUserOnline(f.uid) ? 'text-wa-green' : 'text-zinc-500'}`}>
                            {isUserOnline(f.uid) ? 'Online' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <div className="p-2 bg-wa-green/10 rounded-xl group-hover:bg-wa-green transition-all group-hover:text-white">
                         <MessageSquare className="w-3.5 h-3.5 text-wa-green group-hover:text-white" />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center opacity-40">
                  <Users className="w-10 h-10 mb-2" />
                  <p className="text-xs">No contacts yet.</p>
                </div>
              )}
            </div>
          )}

        {activeTab === 'settings' && (
          <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0B141A] overflow-hidden">
            <div className="p-4 bg-wa-teal dark:bg-wa-panel-dark flex items-center gap-4 text-white">
               {settingsTab !== 'main' && (
                 <button onClick={() => setSettingsTab('main')} className="p-2 hover:bg-white/10 rounded-full">
                    <X className="w-5 h-5" />
                 </button>
               )}
               <h3 className="font-black uppercase tracking-[0.2em] text-xs">
                 {settingsTab === 'main' ? 'Global Settings' : 'Branding Protocol'}
               </h3>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
              <AnimatePresence mode="wait">
                {settingsTab === 'main' ? (
                  <motion.div 
                    key="main-settings"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-4 space-y-4"
                  >
                    {/* Profile Categorization */}
                    <div className="bg-white dark:bg-wa-panel-dark rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                      <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest p-4 pb-2 border-b border-slate-50 dark:border-slate-800/50">Identity Sync</div>
                      <button 
                        onClick={() => onChatSelect({ isProfileEdit: true })}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors text-left border-b border-slate-50 dark:border-slate-800/50"
                      >
                        <div className="flex items-center gap-4">
                          <img src={profile?.profilePic} className="w-12 h-12 rounded-full ring-2 ring-wa-green/20" />
                          <div>
                            <p className="font-bold text-sm dark:text-white">{profile?.displayName}</p>
                            <p className="text-[10px] text-zinc-500">Node ID: #{user?.uid?.slice(-6).toUpperCase()}</p>
                          </div>
                        </div>
                        <Settings className="w-4 h-4 text-zinc-400" />
                      </button>
                      
                      {/* Personal Mute Setting */}
                      <button 
                        onClick={() => toggleMute('all')}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-wa-teal/10 rounded-lg">
                             {profile?.muteAll ? <BellOff className="w-4 h-4 text-red-500" /> : <Bell className="w-4 h-4 text-wa-teal" />}
                          </div>
                          <div>
                            <p className="text-[11px] font-bold dark:text-slate-200">Personal Silent Mode</p>
                            <p className="text-[9px] text-zinc-500 font-medium">Mute all incoming alerts</p>
                          </div>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-all ${profile?.muteAll ? 'bg-red-500' : 'bg-wa-green/20'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${profile?.muteAll ? 'right-1' : 'left-1'}`} />
                        </div>
                      </button>
                    </div>

                    {/* Interface Categorization */}
                    <div className="bg-white dark:bg-wa-panel-dark rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                      <div className="text-[9px] font-black uppercase text-zinc-500 tracking-widest p-4 pb-2 border-b border-slate-50 dark:border-slate-800/50">Interface Protocol</div>
                      <button 
                        onClick={toggleTheme}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-wa-teal/10 rounded-lg">
                            {theme === 'dark' ? <Moon className="w-4 h-4 text-wa-teal" /> : <Sun className="w-4 h-4 text-wa-teal" />}
                          </div>
                          <span className="text-xs font-bold dark:text-slate-200">{theme === 'dark' ? 'Dark Mode Active' : 'Light Mode Active'}</span>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-all ${theme === 'dark' ? 'bg-wa-green' : 'bg-slate-300'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${theme === 'dark' ? 'right-1' : 'left-1'}`} />
                        </div>
                      </button>
                    </div>

                    {/* Admin Categorization */}
                    {isAdmin && (
                      <div className="bg-white dark:bg-wa-panel-dark rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="text-[9px] font-black uppercase text-red-500 tracking-widest p-4 pb-2 border-b border-slate-50 dark:border-slate-800/50 flex items-center gap-2">
                           <ShieldAlert className="w-3 h-3" /> Core Management
                        </div>
                        <button 
                          onClick={() => setSettingsTab('admin')}
                          className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors text-left"
                        >
                          <div className="p-2 bg-red-500/10 rounded-lg">
                            <Palette className="w-4 h-4 text-red-500" />
                          </div>
                          <div>
                            <p className="text-xs font-bold dark:text-white">App Governance</p>
                            <p className="text-[10px] text-zinc-500">Edit branding, logo & favicon</p>
                          </div>
                        </button>
                        <button 
                          onClick={handleCleanDatabase}
                          disabled={isCleaning}
                          className="w-full flex items-center gap-4 p-4 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left text-red-500 border-t border-slate-50 dark:border-slate-800/50"
                        >
                          <div className="p-2 bg-red-500/10 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </div>
                          <div>
                             <p className="text-xs font-bold">{isCleaning ? 'PURGING DATA...' : 'Wipe Chat Sync'}</p>
                             <p className="text-[10px] opacity-60">Global data deletion</p>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Authentication */}
                    <button 
                      onClick={() => auth.signOut()}
                      className="w-full flex items-center gap-4 p-4 bg-white dark:bg-wa-panel-dark rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Logout Protocol</span>
                    </button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="admin-settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="p-4 space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="bg-wa-teal/10 p-5 rounded-[2rem] border border-wa-teal/20">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-wa-teal mb-4 flex items-center gap-2">
                           <Play className="w-3 h-3 fill-current" /> Sponsored Node Setup
                         </h4>
                         <div className="space-y-3">
                           <label className="flex items-center gap-3 p-3 bg-slate-100/50 dark:bg-black/20 rounded-2xl cursor-pointer">
                             <input 
                              type="checkbox" 
                              checked={adminConfig.adNode?.enabled} 
                              onChange={e => setAdminConfig({...adminConfig, adNode: {...(adminConfig.adNode || {title:'',link:'',enabled:true}), enabled: e.target.checked}})}
                              className="w-4 h-4 rounded accent-wa-teal"
                             />
                             <span className="text-[11px] font-bold dark:text-zinc-300">Broadcast Node Activity</span>
                           </label>
                           
                           <input 
                            type="text" 
                            placeholder="Sponsored Title (e.g. AdSid Official)"
                            value={adminConfig.adNode?.title || adminConfig.adNode?.name}
                            onChange={e => setAdminConfig({...adminConfig, adNode: {...(adminConfig.adNode || {title:'',link:'',enabled:true}), title: e.target.value, name: e.target.value}})}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs outline-none dark:text-white"
                           />
                           <textarea 
                            placeholder="Ad Description..."
                            value={adminConfig.adNode?.description}
                            onChange={e => setAdminConfig({...adminConfig, adNode: {...(adminConfig.adNode || {title:'',link:'',enabled:true}), description: e.target.value}})}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs outline-none dark:text-white h-24 no-scrollbar resize-none font-medium"
                           />
                           <input 
                            type="text" 
                            placeholder="Cover Image URL (16:9 recommended)"
                            value={adminConfig.adNode?.image}
                            onChange={e => setAdminConfig({...adminConfig, adNode: {...(adminConfig.adNode || {title:'',link:'',enabled:true}), image: e.target.value}})}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs outline-none dark:text-white"
                           />
                           <input 
                            type="text" 
                            placeholder="Direct Access Link (External)"
                            value={adminConfig.adNode?.link}
                            onChange={e => setAdminConfig({...adminConfig, adNode: {...(adminConfig.adNode || {title:'',link:'',enabled:true}), link: e.target.value}})}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs outline-none dark:text-white"
                           />
                           <input 
                            type="text" 
                            placeholder="Video Stream URL (MP4/YouTube/HLS)"
                            value={adminConfig.adNode?.videoUrl}
                            onChange={e => setAdminConfig({...adminConfig, adNode: {...(adminConfig.adNode || {title:'',link:'',enabled:true}), videoUrl: e.target.value}})}
                            className="w-full bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-xs outline-none focus:border-wa-teal dark:text-white"
                           />
                         </div>
                      </div>

                      <div className="space-y-4 pt-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2">Branding Protocol</h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-400 px-2">App Name</label>
                            <input 
                              type="text" 
                              value={adminConfig.name}
                              onChange={e => setAdminConfig({...adminConfig, name: e.target.value})}
                              className="w-full bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-sm focus:border-wa-green outline-none dark:text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-400 px-2">Logo URL</label>
                            <input 
                              type="text" 
                              value={adminConfig.logo}
                              onChange={e => setAdminConfig({...adminConfig, logo: e.target.value})}
                              className="w-full bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-sm focus:border-wa-green outline-none dark:text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-zinc-400 px-2">Favicon URL</label>
                            <input 
                              type="text" 
                              value={adminConfig.favicon}
                              onChange={e => setAdminConfig({...adminConfig, favicon: e.target.value})}
                              className="w-full bg-slate-100/50 dark:bg-black/20 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl text-sm focus:border-wa-green outline-none dark:text-white"
                            />
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => { updateAppConfig(adminConfig); setSettingsTab('main'); }}
                          className="w-full bg-wa-teal dark:bg-wa-green text-white dark:text-wa-dark-green h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-wa-teal/20 active:scale-95 transition-all mt-4"
                        >
                          Deploy Configurations
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
        </div>
      </div>
      <AnimatePresence>
        {fullscreenImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setFullscreenImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-2xl w-full aspect-square"
              onClick={e => e.stopPropagation()}
            >
              <img src={fullscreenImage} className="w-full h-full object-contain shadow-2xl rounded-2xl border border-white/5" referrerPolicy="no-referrer" />
              <button onClick={() => setFullscreenImage(null)} className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors">
                <X className="w-8 h-8" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
    );
  }
