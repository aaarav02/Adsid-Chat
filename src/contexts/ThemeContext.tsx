import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';
type ChatBackground = 'minimal' | 'wa-green' | 'wa-dark' | 'cyber-teal';

interface ThemeContextType {
  theme: Theme;
  chatBackground: ChatBackground;
  toggleTheme: () => void;
  setChatBackground: (bg: ChatBackground) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'light';
  });

  const [chatBackground, setChatBackgroundState] = useState<ChatBackground>(() => {
    const saved = localStorage.getItem('chatBackground');
    return (saved as ChatBackground) || 'minimal';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('chatBackground', chatBackground);
  }, [chatBackground]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const setChatBackground = (bg: ChatBackground) => setChatBackgroundState(bg);

  return (
    <ThemeContext.Provider value={{ theme, chatBackground, toggleTheme, setChatBackground }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
