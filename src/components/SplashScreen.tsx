import { useEffect } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-white dark:bg-wa-bg-dark text-slate-900 dark:text-white gap-6 transition-colors">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="w-32 h-32 bg-wa-teal rounded-3xl flex items-center justify-center shadow-2xl shadow-wa-teal/20 overflow-hidden"
      >
        <img 
          src="/logo.png" 
          alt="Adsid Logo" 
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              const span = document.createElement('span');
              span.innerText = 'AS';
              span.className = 'text-5xl font-black italic tracking-tighter text-white';
              parent.appendChild(span);
            }
          }}
        />
      </motion.div>
      
      <div className="flex flex-col items-center gap-2">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-black tracking-tight"
        >
          AdSid Chat
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ delay: 0.6 }}
          className="text-sm font-black tracking-[0.3em] uppercase italic text-wa-teal dark:text-wa-green"
        >
          Secure Protocol 2.0
        </motion.p>
      </div>

      <motion.div
        initial={{ width: 0 }}
        animate={{ width: 200 }}
        transition={{ delay: 0.5, duration: 2 }}
        className="h-1 bg-slate-200 dark:bg-slate-800 rounded-full mt-8 overflow-hidden"
      >
        <motion.div
          animate={{ x: [-200, 200] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          className="h-full w-full bg-wa-green rounded-full shadow-[0_0_15px_rgba(37,211,102,0.4)]"
        />
      </motion.div>
    </div>
  );
}
