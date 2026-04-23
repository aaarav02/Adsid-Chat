import React from 'react';
import { motion } from 'motion/react';
import { X, ExternalLink, Play, ShieldCheck, Globe } from 'lucide-react';
import ReactPlayer from 'react-player';

const Player = ReactPlayer as any;

interface SponsoredVideoViewProps {
  ad: {
    title: string;
    link: string;
    videoUrl?: string;
  };
  onClose: () => void;
}

export default function SponsoredVideoView({ ad, onClose }: SponsoredVideoViewProps) {
  return (
    <div className="flex-1 flex flex-col bg-black relative overflow-hidden h-full">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 w-full p-4 flex items-center justify-between z-30 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all sm:hidden"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-wa-green rounded-lg flex items-center justify-center shadow-lg shadow-wa-green/20">
              <ShieldCheck className="w-5 h-5 text-wa-dark-green" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">{ad.title || "Sponsored Node"}</h3>
              <div className="flex items-center gap-1">
                <Globe className="w-2.5 h-2.5 text-wa-green" />
                <span className="text-[8px] text-wa-green font-black uppercase tracking-[0.2em]">Verified Secure Stream</span>
              </div>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10"
        >
          <X className="w-4 h-4" /> Close Loop
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 h-full w-full flex items-center justify-center relative">
        {ad.videoUrl ? (
          <Player
            url={ad.videoUrl}
            width="100%"
            height="100%"
            playing={true}
            controls={true}
            muted={true}
            playsinline={true}
            config={{
              file: {
                attributes: {
                  style: { width: '100%', height: '100%', objectFit: 'contain' }
                }
              }
            }}
          />
        ) : (ad as any).image ? (
          <div className="w-full h-full flex items-center justify-center p-6 sm:p-20">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="relative max-w-4xl w-full aspect-video rounded-[3rem] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] border border-white/10"
             >
                <img src={(ad as any).image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent flex flex-col justify-end p-8 sm:p-12">
                   <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tighter mb-4 leading-tight">{ad.title || (ad as any).name}</h2>
                   <p className="text-base sm:text-lg text-zinc-300 max-w-2xl line-clamp-3 mb-6">{(ad as any).description}</p>
                </div>
             </motion.div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center p-8 text-white">
            <div className="w-20 h-20 bg-wa-teal/20 rounded-3xl flex items-center justify-center border border-wa-teal/30">
               <Play className="w-10 h-10 text-wa-teal fill-current" />
            </div>
            <h4 className="text-xl font-black uppercase tracking-tight">Stream Unavailable</h4>
            <p className="text-sm text-zinc-400 max-w-xs">The protocol could not establish a secure media sync for this node.</p>
          </div>
        )}

        {/* Action Button Overlay (Bottom) */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30"
        >
          <a 
            href={ad.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 bg-white/20 backdrop-blur-md text-white border border-white/20 rounded-full font-black uppercase tracking-widest shadow-2xl hover:bg-white/30 hover:scale-105 active:scale-95 transition-all text-[10px]"
          >
            VISIT ACCESS <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </motion.div>
      </div>

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-wa-teal/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-wa-green/10 rounded-full blur-[120px] animate-pulse delay-700"></div>
      </div>
    </div>
  );
}
