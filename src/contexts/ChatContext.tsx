import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

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
}

interface AppConfig {
  name: string;
  logo: string;
  favicon: string;
}

interface ChatContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  setProfile: (p: UserProfile) => void;
  appConfig: AppConfig;
  updateAppConfig: (config: Partial<AppConfig>) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const DEFAULT_CONFIG: AppConfig = {
  name: "Adsid Chat",
  logo: "/logo.png",
  favicon: "/logo.png"
};

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);

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
    <ChatContext.Provider value={{ user, profile, loading, setProfile: setProfileState, appConfig, updateAppConfig }}>
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
