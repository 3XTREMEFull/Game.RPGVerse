
import React, { useState } from 'react';
import { WorldData } from '../types';
import { generateWorldPremise } from '../services/geminiService';
import { Button } from './Button';
import { Sparkles, Globe2, BookOpen, PenTool, Shuffle, Target, Dices, Info, Skull, UserCog, Hand } from 'lucide-react';

interface WorldSetupProps {
  onWorldCreated: (data: WorldData) => void;
  karmicDice: boolean;
  setKarmicDice: (value: boolean) => void;
  permadeath: boolean;
  setPermadeath: (value: boolean) => void;
  humanGm: boolean;
  setHumanGm: (value: boolean) => void;
  manualDice: boolean;
  setManualDice: (value: boolean) => void;
}

export const WorldSetup: React.FC<WorldSetupProps> = ({ 
    onWorldCreated, 
    karmicDice, 
    setKarmicDice,
    permadeath,
    setPermadeath,
    humanGm,
    setHumanGm,
    manualDice,
    setManualDice
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'random' | 'manual'>('random');
  const [manualInput, setManualInput] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const input = mode === 'manual' ? manualInput : undefined;
      
      if (mode === 'manual' && !manualInput.trim()) {
        setError("Por favor, descreva sua ideia de mundo.");
        setLoading(false);
        return;
      }

      const data = await generateWorldPremise(input);
      onWorldCreated(data);
    } catch (err) {
      console.error("Erro ao gerar mundo:", err);
      setError("Falha ao gerar o mundo. Verifique o console para mais detalhes e sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const ToggleItem = ({ 
      active, 
      onToggle, 
      icon, 
      label, 
      colorClass, 
      description 
  }: { active: boolean, onToggle: () => void, icon: React.ReactNode, label: string, colorClass: string, description: string }) => (
      <div className="flex items-center gap-3 bg-slate-900/80 p-3 rounded-lg border border-slate-800 group relative flex-1 min-w-[200px]">
          <div 
            onClick={onToggle}
            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors shrink-0 ${active ? colorClass.replace('text-', 'bg-') : 'bg-slate-600'}`}
          >
             <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${active ? 'translate-x-6' : 'translate-x-0'}`}></div>
          </div>
          <span className={`text-sm font-bold flex items-center gap-2 cursor-help whitespace-nowrap ${active ? colorClass : 'text-slate-500'}`}>
             {icon}
             {label}
          </span>
          
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-xs text-left">
              <p className="text-slate-300 leading-relaxed">{description}</p>
              <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 border-b border-r border-slate-600 transform rotate-45"></div>
          </div>
      </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-8 animate-fade-in w-full max-w-4xl mx-auto">
      <div className="max-w-2xl space-y-4">
        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/30">
          <Globe2 size={40} className="text-amber-500" />
        </div>
        
        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-600">
          Gênese do Mundo
        </h2>
        
        <p className="text-slate-400 text-lg">
          O Mestre de Jogo irá conjurar um universo único. Você pode deixar o destino decidir ou guiar a mão da criação.
        </p>
      </div>

      <div className="w-full max-w-lg mx-auto bg-slate-900/50 p-1 rounded-xl flex border border-slate-800">
        <button
          onClick={() => setMode('random')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'random' ? 'bg-slate-800 text-amber-500 font-bold shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Shuffle size={16} /> Aleatório
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'manual' ? 'bg-slate-800 text-amber-500 font-bold shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <PenTool size={16} /> Manual
        </button>
      </div>

      {mode === 'manual' && (
        <div className="w-full max-w-lg animate-fade-in">
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Ex: Um mundo onde o sol nunca nasce e vampiros protegem a humanidade de monstros das sombras..."
            className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg p-4 text-white focus:border-amber-500 outline-none resize-none"
          />
        </div>
      )}

      {/* Settings Grid */}
      <div className="flex flex-wrap justify-center gap-4 w-full max-w-3xl">
          <ToggleItem 
              active={karmicDice} 
              onToggle={() => setKarmicDice(!karmicDice)}
              icon={<Dices size={16}/>}
              label="Dados Kármicos"
              colorClass="text-purple-400"
              description="Equilibra a sorte para evitar sequências extremas de falhas ou sucessos (automático)."
          />
          
          <ToggleItem 
              active={manualDice} 
              onToggle={() => setManualDice(!manualDice)}
              icon={<Hand size={16}/>}
              label="Dados Manuais"
              colorClass="text-blue-400"
              description="Você rola dados físicos e insere o número. Desativa dados automáticos."
          />

          <ToggleItem 
              active={permadeath} 
              onToggle={() => setPermadeath(!permadeath)}
              icon={<Skull size={16}/>}
              label="Morte Permanente"
              colorClass="text-red-500"
              description="Se o HP chegar a 0, o personagem morre definitivamente. Sobrevive com 1 HP uma vez."
          />

          <ToggleItem 
              active={humanGm} 
              onToggle={() => setHumanGm(!humanGm)}
              icon={<UserCog size={16}/>}
              label="GM Humano Auxiliar"
              colorClass="text-amber-400"
              description="Habilita uma opção na tela de jogo para você sugerir eventos específicos para a IA narrar."
          />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 p-4 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <Button 
        onClick={handleGenerate} 
        isLoading={loading}
        className="text-lg px-8 py-4 w-full max-w-xs"
      >
        <Sparkles size={20} />
        {mode === 'random' ? 'Criar Mundo' : 'Refinar Ideia'}
      </Button>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-500 max-w-3xl mt-12 border-t border-slate-800 pt-8">
        <div className="flex flex-col items-center">
          <BookOpen className="mb-2 opacity-50" />
          <span>Premissas Únicas</span>
        </div>
        <div className="flex flex-col items-center">
          <Sparkles className="mb-2 opacity-50" />
          <span>Temas Profundos</span>
        </div>
        <div className="flex flex-col items-center">
          <Globe2 className="mb-2 opacity-50" />
          <span>Conflitos Épicos</span>
        </div>
        <div className="flex flex-col items-center text-amber-500/70">
          <Target className="mb-2 opacity-80" />
          <span>Objetivo Final</span>
        </div>
      </div>
    </div>
  );
};
