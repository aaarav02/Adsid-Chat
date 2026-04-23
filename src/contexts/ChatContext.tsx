import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, setDoc, getDoc, query, collection, where } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  displayName: string;
  protocolId?: string;
  profilePic: string;
  bio?: string;
  gender?: string;
  age?: number;
  status: 'online' | 'offline';
  lastSeen: any;
  isRegistered: boolean;
  mutedUsers?: string[];
  muteAll?: boolean;
}

interface AppConfig {
  name: string;
  logo: string;
  favicon: string;
  adNode?: {
    title?: string;
    name?: string;
    description?: string;
    image?: string;
    link: string;
    videoUrl?: string;
    enabled: boolean;
  };
}

interface ChatContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  setProfile: (p: UserProfile) => void;
  appConfig: AppConfig;
  updateAppConfig: (config: Partial<AppConfig>) => Promise<void>;
  toggleMute: (targetId: string | 'all') => Promise<void>;
  lastNotification: { id: string; senderName: string; content: string; senderPic?: string; chatId: string; } | null;
  setLastNotification: (n: any) => void;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const DEFAULT_CONFIG: AppConfig = {
  name: "Adsid Chat",
  logo: "/logo.png",
  favicon: "/logo.png",
  adNode: {
    name: "AdSid Protocol Partner",
    description: "Official protocol broadcast and media sync node. Securely expanding the AdSid network.",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1000&auto=format&fit=crop",
    link: "https://google.com",
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
    enabled: true
  }
};

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // Global message listener for notifications
  useEffect(() => {
    if (!user || profile?.muteAll) return;
    
    const q = query(
      collection(db, 'chats'), 
      where('participants', 'array-contains', user.uid)
    );

    const unsubMessages = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const chat = { id: change.doc.id, ...change.doc.data() } as any;
          const msg = chat.lastMessage;
          
          if (msg && msg.senderId !== user.uid && !msg.seen && chat.id !== currentChatId) {
            // Check if chat is muted
            if (profile?.mutedUsers?.includes(chat.id) || profile?.mutedUsers?.includes(msg.senderId)) return;

            const otherId = chat.participants.find((p: string) => p !== user.uid);
            const otherDetails = chat.participantDetails?.[msg.senderId] || chat.participantDetails?.[otherId] || {};
            
            setLastNotification({
              id: Date.now().toString(),
              senderName: chat.type === 'group' ? `${otherDetails.name || 'User'} @ ${chat.name}` : (otherDetails.name || "Adsid Node"),
              content: msg.content,
              senderPic: otherDetails.pic || otherDetails.profilePic,
              chatId: chat.id
            });
          }
        }
      });
    });

    return () => unsubMessages();
  }, [user, profile?.muteAll, profile?.mutedUsers, currentChatId]);

  // Listen for App Config
  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, 'settings', 'appConfig'), (snap) => {
      if (snap.exists()) {
        setAppConfig(snap.data() as AppConfig);
        // Update favicon dynamically
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (link) link.href = snap.data().favicon || "/logo.png";
        document.title = snap.data().name || "Adsid Chat";
      }
    });

    return () => unsubConfig();
  }, []);

  const updateAppConfig = async (newConfig: Partial<AppConfig>) => {
    try {
      await setDoc(doc(db, 'settings', 'appConfig'), { ...appConfig, ...newConfig }, { merge: true });
    } catch (e) {
      console.error("Config update failed", e);
    }
  };

  const toggleMute = async (targetId: string | 'all') => {
    if (!user || !profile) return;
    try {
      if (targetId === 'all') {
        await updateDoc(doc(db, 'users', user.uid), { muteAll: !profile.muteAll });
      } else {
        const muted = profile.mutedUsers || [];
        const isMuted = muted.includes(targetId);
        const updated = isMuted ? muted.filter(id => id !== targetId) : [...muted, targetId];
        await updateDoc(doc(db, 'users', user.uid), { mutedUsers: updated });
      }
    } catch (e) {
      console.error("Mute toggle failed", e);
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfileState(null);
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  // Listen to profile changes and keep status updated
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    
    // Initial online status set
    const setOnline = async () => {
      try {
        await updateDoc(userRef, {
          status: 'online',
          lastSeen: serverTimestamp()
        });
      } catch (e) { /* ignore */ }
    };
    
    // Inactivity/Tab close logic
    const setOffline = async () => {
      try {
        await updateDoc(userRef, {
          status: 'offline',
          lastSeen: serverTimestamp()
        });
      } catch (e) { /* ignore */ }
    };

    setOnline();

    // Heartbeat: Update lastSeen every 45s (Optimized for quota + realtime feel)
    const heartbeat = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setOnline();
      }
    }, 45000); 

    // Listen for profile updates
    const unsubProfile = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setProfileState(snap.data() as UserProfile);
      } else {
        setProfileState(null);
      }
      setLoading(false);
    });

    let visibilityTimeout: any;
    const handlePresence = () => {
      clearTimeout(visibilityTimeout);
      visibilityTimeout = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          setOffline();
        } else {
          setOnline();
        }
      }, 5000); // Debounce visibility changes by 5s to save writes
    };

    window.addEventListener('beforeunload', setOffline);
    window.addEventListener('visibilitychange', handlePresence);
    window.addEventListener('offline', setOffline);
    
    return () => {
      clearInterval(heartbeat);
      unsubProfile();
      window.removeEventListener('beforeunload', setOffline);
      window.removeEventListener('visibilitychange', handlePresence);
      window.removeEventListener('offline', setOffline);
      setOffline();
    };
  }, [user]);

  return (
    <ChatContext.Provider value={{ 
      user, profile, loading, setProfile: setProfileState, appConfig, updateAppConfig, toggleMute,
      lastNotification, setLastNotification, currentChatId, setCurrentChatId
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
