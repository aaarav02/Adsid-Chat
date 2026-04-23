import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Camera, User, FileText, ChevronRight } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';

export default function ProfileSetup({ onComplete }: { onComplete?: () => void }) {
  const { user, profile, setProfile } = useChat();
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || user?.displayName || '',
    protocolId: profile?.protocolId || '',
    bio: profile?.bio || '',
    gender: profile?.gender || 'Other',
    age: profile?.age || 18,
    profilePic: profile?.profilePic || user?.photoURL || ''
  });
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFormData({ ...formData, profilePic: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      // 1. Check for protocolId uniqueness if changed
      if (formData.protocolId && formData.protocolId !== profile?.protocolId) {
        const q = query(collection(db, 'users'), where('protocolId', '==', formData.protocolId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          alert("Protocol Alert: This ID is already assigned to another node. Please choose a unique identifier.");
          setLoading(false);
          return;
        }
      }

      const dbData = {
        uid: user.uid,
        ...formData,
        status: profile?.status || 'online',
        lastSeen: serverTimestamp(),
        isRegistered: true
      };
      
      await setDoc(doc(db, 'users', user.uid), dbData);
      
      // Update local state immediately with local timestamp to avoid wait
      setProfile({
        ...dbData,
        lastSeen: { toMillis: () => Date.now() } // Mock for immediate display
      } as any);
      
      onComplete?.();
    } catch (error) {
      console.error("Profile update failed", error);
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!onComplete;

  return (
    <div className={`${!isEditing ? 'min-h-screen w-full bg-wa-bg-light dark:bg-wa-bg-dark flex items-center justify-center p-4 transition-colors' : 'w-full'}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-xl ${!isEditing ? 'bg-white dark:bg-wa-panel-dark border border-slate-200 dark:border-slate-800 rounded-[3rem] p-10 md:p-14 shadow-2xl transition-all' : ''}`}
      >
        {!isEditing && (
          <div className="mb-10 space-y-3">
            <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">AdSid Profile</h2>
            <p className="text-zinc-500 font-medium leading-relaxed">Establish your secure digital identity. Your details are encrypted on the protocol nodes.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="flex flex-col md:flex-row gap-12 items-center md:items-start">
            {/* Avatar Selection Placeholder */}
            <div className="flex flex-col items-center gap-6">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageChange} 
                  className="hidden" 
                  accept="image/*"
                />
                <div className="w-40 h-40 rounded-full bg-slate-100 dark:bg-zinc-900 flex items-center justify-center overflow-hidden border-4 border-white dark:border-zinc-800 ring-8 ring-wa-green/5 shadow-2xl shadow-wa-green/10 transition-all group-hover:ring-wa-green/10">
                  {formData.profilePic ? (
                    <img 
                      src={formData.profilePic} 
                      alt="Avatar" 
                      className="w-full h-full object-cover transition-transform duration-200" 
                      style={{ transform: `scale(${zoom})` }}
                    />
                  ) : (
                    <Camera className="w-12 h-12 text-slate-300 dark:text-zinc-700" />
                  )}
                </div>
                <div className="absolute bottom-2 right-2 bg-wa-teal p-3 rounded-full border-4 border-white dark:border-wa-panel-dark group-hover:scale-110 transition-transform cursor-pointer shadow-lg shadow-wa-teal/30">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </div>

              {formData.profilePic && (
                <div className="w-full max-w-[200px] space-y-2">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-wa-teal dark:text-wa-green">
                    <span>Selection Zoom</span>
                    <span>{Math.round(zoom * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="3" 
                    step="0.01" 
                    value={zoom} 
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full accent-wa-green h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 w-full space-y-6 mt-4 md:mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green ml-1">Visible Alias</label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 dark:text-zinc-600" />
                    <input
                      type="text"
                      required
                      value={formData.displayName}
                      onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                      placeholder="e.g. Ghost"
                      className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl py-4 pl-14 pr-6 text-slate-900 dark:text-white focus:border-wa-green focus:ring-1 focus:ring-wa-green transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green ml-1">Unique Protocol ID</label>
                  <div className="relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">@</div>
                    <input
                      type="text"
                      required
                      value={formData.protocolId}
                      onChange={e => setFormData({ ...formData, protocolId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                      placeholder="user_01"
                      className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl py-4 pl-10 pr-6 text-slate-900 dark:text-white focus:border-wa-green focus:ring-1 focus:ring-wa-green transition-all outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green ml-1">Encrypted Bio</label>
                <div className="relative">
                  <FileText className="absolute left-5 top-5 w-5 h-5 text-slate-300 dark:text-zinc-600" />
                  <textarea
                    value={formData.bio}
                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Your cryptographic signature..."
                    className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl py-5 pl-14 pr-6 text-slate-900 dark:text-white focus:border-wa-green transition-all outline-none min-h-[140px] resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green ml-1">Gender Node</label>
              <select
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value })}
                className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl py-4 px-6 text-slate-900 dark:text-white focus:border-wa-green transition-all outline-none appearance-none cursor-pointer"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-wa-teal dark:text-wa-green ml-1">Vetting Age</label>
              <input
                type="number"
                min="13"
                max="120"
                value={formData.age}
                onChange={e => setFormData({ ...formData, age: parseInt(e.target.value) })}
                className="w-full bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl py-4 px-6 text-slate-900 dark:text-white focus:border-wa-green transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-wa-green text-wa-dark-green font-black py-6 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 group disabled:opacity-50 shadow-2xl shadow-wa-green/20 hover:bg-wa-teal hover:text-white"
          >
            {loading ? "INITIALIZING NODE..." : isEditing ? "SAVE CONFIGURATION" : "REGISTER ON PROTOCOL"}
            <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
