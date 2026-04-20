import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

interface UserProfile {
  uid: string;
  displayName: string;
  profilePic: string;
  bio?: string;
  gender?: string;
  age?: number;
  status: 'online' | 'offline';
  lastSeen: any;
  isRegistered: boolean;
}

interface ChatContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  setProfile: (p: UserProfile) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await updateDoc(userRef, {
          status: 'online',
          lastSeen: serverTimestamp()
        });
      }
    };
    setOnline();

    // Listen for profile updates
    const unsubProfile = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setProfileState(snap.data() as UserProfile);
      } else {
        setProfileState(null);
      }
      setLoading(false);
    });

    // Inactivity/Tab close logic
    const setOffline = () => {
      // Use navigator.sendBeacon or a quick fire-and-forget update if possible
      // but for simplicity in this env just updateDoc
      updateDoc(userRef, {
        status: 'offline',
        lastSeen: serverTimestamp()
      });
    };

    window.addEventListener('beforeunload', setOffline);
    
    return () => {
      unsubProfile();
      window.removeEventListener('beforeunload', setOffline);
      setOffline();
    };
  }, [user]);

  return (
    <ChatContext.Provider value={{ user, profile, loading, setProfile: setProfileState }}>
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
