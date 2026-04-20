import { useState, useEffect } from 'react';
import { Search, Users, UserPlus, LogOut, MessageSquare, Plus, Bell, User, Sun, Moon, Compass, CheckCircle2, CheckCheck, Trash2, ShieldAlert } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { useChat } from '../contexts/ChatContext';
import { useTheme } from '../contexts/ThemeContext';
import { collection, query, where, onSnapshot, getDocs, addDoc, serverTimestamp, doc, updateDoc, limit, deleteDoc, writeBatch } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';

interface SidebarProps {
  onChatSelect: (chat: any) => void;
  selectedChatId?: string;
}

export default function Sidebar({ onChatSelect, selectedChatId }: SidebarProps) {
  const { user, profile } = useChat();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'chats' | 'friends' | 'requests' | 'search' | 'discover'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<any[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});

  const isAdmin = user?.email === 'extremear762@gmail.com';

  // Listen for chats
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    return onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChats(chatList);

      // Fetch missing profiles for participants
      const missingIds = new Set<string>();
      chatList.forEach((chat: any) => {
        chat.participants?.forEach((pid: string) => {
          if (pid !== user.uid && !chat.participantDetails?.[pid]?.name && !userProfiles[pid]) {
            missingIds.add(pid);
          }
        });
      });

      if (missingIds.size > 0) {
        missingIds.forEach(async (pid) => {
          const uDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', pid), limit(1)));
          if (!uDoc.empty) {
            const userData = uDoc.docs[0].data();
            setUserProfiles(prev => ({ ...prev, [pid]: userData }));
          }
        });
      }
    });
  }, [user, userProfiles]);

  // Listen for requests
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'friendRequests'),
      where('toId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [user]);

  // Discover Online Users - Filtered
  useEffect(() => {
    if (!user || activeTab !== 'discover') return;
    
    // First, get all current connections/requests to hide them
    const fetchConnections = async () => {
      const connections = new Set<string>();
      
      // Get existing chat participants
      const chatSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid)));
      chatSnap.docs.forEach(d => {
        d.data().participants?.forEach((p: string) => connections.add(p));
      });

      // Get pending requests (sent or received)
      const reqSnapSent = await getDocs(query(collection(db, 'friendRequests'), where('fromId', '==', user.uid)));
      reqSnapSent.docs.forEach(d => connections.add(d.data().toId));
      
      const reqSnapRecv = await getDocs(query(collection(db, 'friendRequests'), where('toId', '==', user.uid)));
      reqSnapRecv.docs.forEach(d => connections.add(d.data().fromId));

      const q = query(
        collection(db, 'users'),
        where('status', '==', 'online'),
        limit(50)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setDiscoverUsers(snapshot.docs
          .map(doc => doc.data())
          .filter(u => u.uid !== user.uid && !connections.has(u.uid))
        );
      });
      return unsubscribe;
    };

    fetchConnections();
  }, [user, activeTab]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    
    // Fetch connections to filter
    const connections = new Set<string>();
    const chatSnap = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', user.uid)));
    chatSnap.docs.forEach(d => d.data().participants?.forEach((p: string) => connections.add(p)));
    
    const reqSnapSent = await getDocs(query(collection(db, 'friendRequests'), where('fromId', '==', user.uid)));
    reqSnapSent.docs.forEach(d => connections.add(d.data().toId));
    
    const reqSnapRecv = await getDocs(query(collection(db, 'friendRequests'), where('toId', '==', user.uid)));
    reqSnapRecv.docs.forEach(d => connections.add(d.data().fromId));

    const q = query(collection(db, 'users'), where('displayName', '>=', searchQuery), where('displayName', '<=', searchQuery + '\uf8ff'));
    const snap = await getDocs(q);
    setSearchResults(snap.docs.map(d => d.data()).filter(u => u.uid !== user?.uid && !connections.has(u.uid)));
  };

  const sendFriendRequest = async (targetUser: any) => {
    if (!user) return;
    
    // Check for existing request
    const q = query(
      collection(db, 'friendRequests'),
      where('fromId', '==', user.uid),
      where('toId', '==', targetUser.uid)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      alert("Request already pending or you are already connected.");
      return;
    }

    await addDoc(collection(db, 'friendRequests'), {
      fromId: user?.uid,
      fromName: profile?.displayName,
      fromPic: profile?.profilePic,
      toId: targetUser.uid,
      status: 'pending',
      timestamp: serverTimestamp()
    });
    alert("Request Sent!");
  };

  const acceptRequest = async (req: any) => {
    if (!user) return;
    
    // Create individual chat with participant details for better UI resolution
    await addDoc(collection(db, 'chats'), {
      type: 'individual',
      participants: [user.uid, req.fromId],
      participantDetails: {
        [user.uid]: { name: profile?.displayName, pic: profile?.profilePic },
        [req.fromId]: { name: req.fromName, pic: req.fromPic }
      },
      createdAt: serverTimestamp()
    });

    // Delete the request document so it disappears from the list
    await deleteDoc(doc(db, 'friendRequests', req.id));
  };

  const createGroup = async () => {
    const name = prompt("Enter group name:");
    if (!name) return;
    await addDoc(collection(db, 'chats'), {
      type: 'group',
      name,
      participants: [user?.uid],
      participantDetails: {
        [user?.uid!]: { name: profile?.displayName, pic: profile?.profilePic }
      },
      createdAt: serverTimestamp()
    });
  };

  const handleCleanDatabase = async () => {
    if (!isAdmin) return;
    if (!confirm("Are you ABSOLUTELY sure? This will delete ALL chats, messages, and friend requests for everyone. This cannot be undone.")) return;
    
    setIsCleaning(true);
    try {
      // 1. Delete all friend requests
      const reqs = await getDocs(collection(db, 'friendRequests'));
      for (const d of reqs.docs) await deleteDoc(d.ref);

      // 2. Delete all chats and their messages
      const chatsSnap = await getDocs(collection(db, 'chats'));
      for (const chatDoc of chatsSnap.docs) {
        const msgs = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
        for (const msg of msgs.docs) await deleteDoc(msg.ref);
        await deleteDoc(chatDoc.ref);
      }

      alert("Database cleaned successfully. System load minimized.");
    } catch (err) {
      console.error("Cleanup failed", err);
      alert("Error during cleanup. Check console.");
    } finally {
      setIsCleaning(false);
    }
  };

  return (
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
              <p className="text-[10px] opacity-70">AdSid Secure Sync</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={toggleTheme}
              className="p-2 hover:bg-white/10 rounded-full transition-all"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => onChatSelect({ isProfileEdit: true })}
              className="p-2 hover:bg-white/10 rounded-full transition-all"
            >
              <User className="w-4 h-4" />
            </button>
            <button onClick={() => auth.signOut()} className="p-2 hover:bg-white/10 rounded-full transition-all" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button 
                onClick={handleCleanDatabase} 
                disabled={isCleaning}
                className={`p-2 rounded-full transition-all ${isCleaning ? 'bg-red-500 animate-pulse' : 'hover:bg-red-500/20 text-red-100 hover:text-red-400'}`}
                title="Admin: Clean Database"
              >
                <ShieldAlert className="w-4 h-4" />
              </button>
            )}
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
      <div className="flex items-center bg-wa-teal dark:bg-wa-panel-dark text-white shadow-inner">
        {[
          { id: 'chats', icon: MessageSquare, label: 'Chats' },
          { id: 'discover', icon: Compass, label: 'Discover' },
          { id: 'requests', icon: Bell, label: 'Requests', count: requests.length },
          { id: 'friends', icon: Users, label: 'Friends' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
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
        <button onClick={createGroup} className="px-4 text-white/60 hover:text-wa-green transition-colors">
           <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar bg-white dark:bg-[#0B141A] transition-colors">
        {activeTab === 'chats' && (chats.length > 0 ? (
          chats.map(chat => {
            const otherParticipantId = chat.participants?.find((p: string) => p !== user?.uid);
            const otherDetails = chat.participantDetails?.[otherParticipantId] || userProfiles[otherParticipantId] || {};
            
            // Priority: Stored name -> Fetched profile -> Fallback placeholder
            const chatName = chat.name || otherDetails.name || otherDetails.displayName || (chat.type === 'individual' ? `AdSid User` : "Direct Message");
            const chatPic = otherDetails.pic || otherDetails.profilePic || otherDetails.photoURL || null;
            
            return (
              <button
                key={chat.id}
                onClick={() => onChatSelect(chat)}
                className={`w-full flex items-center gap-4 p-3 transition-colors border-b border-slate-100 dark:border-slate-800/50 ${
                  selectedChatId === chat.id ? 'bg-slate-100 dark:bg-zinc-800/50' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/30'
                }`}
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden flex items-center justify-center border border-slate-100 dark:border-zinc-700">
                    {chat.type === 'group' ? (
                      <Users className="w-6 h-6 text-slate-400" />
                    ) : (
                      <div className="w-full h-full bg-wa-teal/10 flex items-center justify-center">
                         {chatPic ? <img src={chatPic} className="w-full h-full object-cover" /> : <User className="text-wa-teal/40 w-6 h-6" />}
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-2 border-white dark:border-zinc-950 rounded-full status-online"></div>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex justify-between items-center mb-0.5">
                    <h4 className="text-[13px] font-semibold truncate dark:text-slate-200">{chatName}</h4>
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
          <div className="p-3 grid grid-cols-1 gap-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-wa-teal dark:text-wa-green/60 px-1 mb-1">
              Active Protocol Members
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
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-bold truncate dark:text-slate-100">{u.displayName}</p>
                        <CheckCircle2 className="w-3 h-3 text-blue-500 fill-blue-500/10" />
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
                <p className="text-xs font-bold leading-relaxed">No other online nodes detected.<br/>Note: You must use different accounts to see each other.</p>
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
          <div key={u.uid} className="p-4 bg-slate-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between mb-2 mx-3 mt-2">
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
      </div>
    </div>
  );
}
