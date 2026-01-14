
import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Music, PlayCircle, AlertTriangle } from 'lucide-react';

export type MusicTrack = 'MENU' | 'EXPLORATION' | 'COMBAT' | 'VICTORY' | 'DEFEAT';

interface AudioControllerProps {
  track: MusicTrack;
}

// URLs atualizadas para usar o redirecionador estável do Archive.org
const TRACK_URLS: Record<MusicTrack, string> = {
  MENU: "https://archive.org/download/ChiptuneSongs/03.Black%20Hole.mp3",
  EXPLORATION: "https://archive.org/download/ChiptuneSongs/01.A%20Night%20Of%20Dizzy%20Spells.mp3",
  COMBAT: "https://archive.org/download/ChiptuneSongs/02.TurnTheTide.mp3",
  VICTORY: "https://archive.org/download/8-bit-music-pack-loopable/Victory%20%28Loopable%29.mp3",
  DEFEAT: "https://archive.org/download/8-bit-music-pack-loopable/Game%20Over%20%28Loopable%29.mp3"
};

export const AudioController: React.FC<AudioControllerProps> = ({ track }) => {
  const [volume, setVolume] = useState(0.3);
  const [isMuted, setIsMuted] = useState(false);
  const [waitingForInteraction, setWaitingForInteraction] = useState(false);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.loop = true;
        
        // Listener global de erro para o elemento de áudio
        audioRef.current.onerror = (e) => {
            console.error("Erro no player de áudio:", audioRef.current?.error);
            setHasError(true);
        };
        
        // Listener para recuperação automática se possível
        audioRef.current.oncanplay = () => {
            setHasError(false);
        };
    }

    const audio = audioRef.current;
    
    const playMusic = async () => {
        try {
            const trackUrl = TRACK_URLS[track];
            // Reset erro ao tentar nova faixa
            setHasError(false);

            // Apenas altera o source se for diferente para evitar reinício da música
            if (audio.src !== trackUrl) {
                audio.src = trackUrl;
                audio.volume = isMuted ? 0 : volume;
                audio.load(); // Força recarregamento para garantir novo source
            }
            
            // Tenta dar play
            await audio.play();
            setWaitingForInteraction(false); // Sucesso
        } catch (e: any) {
            // Se o erro for NotAllowedError (Autoplay bloqueado), pede interação
            if (e.name === 'NotAllowedError') {
                console.warn("Autoplay bloqueado. Aguardando interação do usuário.");
                setWaitingForInteraction(true);
            } else {
                console.error("Erro ao tentar tocar áudio:", e);
                // Não setamos erro visual aqui imediatamente, deixamos o onerror pegar falhas de source
            }
        }
    };

    playMusic();

  }, [track]);

  // Atualiza volume em tempo real
  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleUnlockAudio = () => {
    if (audioRef.current) {
        audioRef.current.play()
            .then(() => setWaitingForInteraction(false))
            .catch(e => console.error("Ainda bloqueado:", e));
    }
  };

  if (waitingForInteraction) {
      return (
        <button 
            onClick={handleUnlockAudio}
            className="fixed bottom-4 right-4 z-50 bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 p-3 rounded-full shadow-xl flex items-center gap-2 animate-bounce transition-all"
        >
            <PlayCircle size={24} fill="currentColor" />
            <span className="text-xs font-bold uppercase pr-1">Ativar Som</span>
        </button>
      );
  }

  if (hasError) {
      return (
        <div className="fixed bottom-4 right-4 z-50 bg-red-900/90 border border-red-700 p-2 rounded-lg shadow-xl flex items-center gap-2 backdrop-blur-sm animate-fade-in text-red-200">
            <AlertTriangle size={16} />
            <span className="text-[10px] font-bold uppercase">Áudio Indisponível</span>
        </div>
      );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-slate-900/90 border border-slate-700 p-2 rounded-lg shadow-xl flex items-center gap-3 backdrop-blur-sm animate-fade-in group transition-all hover:bg-slate-900">
      <div className="flex flex-col">
          <span className="text-[8px] font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Music size={8} /> 8-Bit Audio
          </span>
          <div className="flex items-center gap-2">
            <button 
                onClick={() => setIsMuted(!isMuted)} 
                className="text-slate-400 hover:text-white transition-colors"
                title={isMuted ? "Desmutar" : "Mutar"}
            >
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05" 
                value={volume} 
                onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                }}
                className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
      </div>
      <div className="h-8 w-8 bg-slate-800 rounded flex items-center justify-center border border-slate-700 overflow-hidden">
        {/* Visualizador Simples */}
        <div className="flex items-end justify-center gap-[2px] h-4 w-5">
             <div className={`w-1 bg-green-500 rounded-t-sm transition-all duration-75 ${!isMuted && volume > 0 ? 'animate-[bounce_0.4s_infinite] h-full' : 'h-1 opacity-20'}`}></div>
             <div className={`w-1 bg-green-500 rounded-t-sm transition-all duration-100 ${!isMuted && volume > 0 ? 'animate-[bounce_0.6s_infinite] h-3/4' : 'h-1 opacity-20'}`}></div>
             <div className={`w-1 bg-green-500 rounded-t-sm transition-all duration-150 ${!isMuted && volume > 0 ? 'animate-[bounce_0.5s_infinite] h-1/2' : 'h-1 opacity-20'}`}></div>
        </div>
      </div>
    </div>
  );
};
