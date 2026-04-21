import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useChat, ChatProvider } from './contexts/ChatContext';
import SplashScreen from './components/SplashScreen';
import AuthScreen from './components/AuthScreen';
import ProfileSetup from './components/ProfileSetup';
import MainLayout from './components/MainLayout';

function AppContent() {
  const { user, profile, loading } = useChat();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-wa-bg-dark transition-colors text-wa-teal dark:text-wa-green">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-current"></div>
    </div>
  );

  if (!user) {
    return <AuthScreen />;
  }

  if (!profile) {
    return <ProfileSetup />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="main"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="h-screen w-screen overflow-hidden bg-white dark:bg-wa-bg-dark text-slate-900 dark:text-white"
      >
        <MainLayout />
      </motion.div>
    </AnimatePresence>
  );
}

import { ThemeProvider } from './contexts/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <ChatProvider>
        <AppContent />
      </ChatProvider>
    </ThemeProvider>
  );
}
