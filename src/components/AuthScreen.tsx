import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';

export default function AuthScreen() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-wa-bg-light dark:bg-wa-bg-dark px-4 transition-colors">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white dark:bg-wa-panel-dark p-10 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col items-center gap-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-wa-green shadow-[0_0_15px_rgba(37,211,102,0.4)]" />
        
        <div className="w-24 h-24 bg-wa-teal rounded-3xl flex items-center justify-center shadow-lg shadow-wa-teal/20 rotate-3 transform hover:rotate-0 transition-transform cursor-default overflow-hidden">
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
                span.className = 'text-4xl font-black italic tracking-tighter text-white';
                parent.appendChild(span);
              }
            }}
          />
        </div>
        
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">AdSid Protocol</h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium px-4">Secure. Private. Disappearing. The future of messaging is here.</p>
        </div>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-4 bg-wa-green text-wa-dark-green font-black py-5 px-6 rounded-2xl hover:bg-wa-dark-green hover:text-white transition-all active:scale-95 group shadow-xl shadow-wa-green/20"
        >
          <LogIn className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          Connect via Google
        </button>

        <div className="flex items-center gap-2 text-wa-teal dark:text-wa-green opacity-70">
           <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
           <span className="text-[10px] uppercase font-black tracking-widest leading-none">Security nodes active</span>
        </div>
      </motion.div>
    </div>
  );
}
