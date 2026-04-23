import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, BellOff } from 'lucide-react';

interface InAppNotificationProps {
  notification: {
    id: string;
    senderName: string;
    content: string;
    senderPic?: string;
    chatId: string;
  } | null;
  onClose: () => void;
  onAction: (chatId: string) => void;
  isMuted?: boolean;
}

export default function InAppNotification({ notification, onClose, onAction, isMuted }: InAppNotificationProps) {
  useEffect(() => {
    if (notification && !isMuted) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, isMuted, onClose]);

  if (isMuted) return null;

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -100, x: '-50%' }}
          animate={{ opacity: 1, y: 20, x: '-50%' }}
          exit={{ opacity: 0, y: -100, x: '-50%' }}
          className="fixed top-0 left-1/2 z-[999] w-[90%] max-w-sm"
        >
          <div className="bg-white dark:bg-wa-panel-dark border border-slate-200 dark:border-slate-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] dark:shadow-black/50 p-4 flex items-center gap-4 transition-all active:scale-[0.98] cursor-pointer"
               onClick={() => onAction(notification.chatId)}>
            <div className="relative">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-wa-green/20">
                {notification.senderPic ? (
                  <img src={notification.senderPic} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-wa-teal/10 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-wa-teal/40" />
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-wa-green p-1 rounded-full shadow-sm">
                <MessageSquare className="w-2.5 h-2.5 text-wa-dark-green" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-black uppercase tracking-tight dark:text-white truncate">
                {notification.senderName}
              </h4>
              <p className="text-xs text-zinc-500 truncate mt-0.5 italic">
                {notification.content}
              </p>
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
