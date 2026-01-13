
import React, { useState, useRef, useEffect } from 'react';
import { Character, NarrativeTurn, DiceType, RollResult, WorldData, TurnResponse, Enemy, MapData, StatusEffect } from '../types';
import { processTurn } from '../services/geminiService';
import { Button } from './Button';
import { Send, User, Sparkles, Activity, Dices, ChevronDown, Target, Trophy, Skull, Backpack, Heart, Flame, Droplets, Sword, ClipboardList, ScrollText, Map as MapIcon, Compass, ShieldCheck, Box, AlertCircle, Clock, Plus, XCircle, Zap } from 'lucide-react';

interface NarrativeViewProps {
  characters: Character[];
  initialHistory: NarrativeTurn[];
  worldData?: WorldData;
  initialEnemies?: Enemy[];
  karmicDiceEnabled?: boolean;
  initialMapData?: MapData; 
  onStateChange: (hasEnemies: boolean, gameResult: 'victory' | 'defeat' | null) => void;
}

interface MechanicLog {
  id: string;
  timestamp: number;
  source: string;
  content: string;
  type: 'player-roll' | 'enemy-roll' | 'system-info' | 'damage' | 'gain';
  value?: number; 
}

// Definição das Regras de Status
const AVAILABLE_STATUSES: StatusEffect[] = [
    { name: 'Sangrando', duration: 3, description: 'O alvo perde 1 ponto de vida no início de cada um de seus turnos.' },
    { name: 'Queimando', duration: 3, description: 'O alvo está em chamas e sofre 1d4 de dano de fogo por turno.' },
    { name: 'Envenenado', duration: 3, description: 'O alvo tem Desvantagem em jogadas de ataque e testes de habilidade.' },
    { name: 'Atordoado', duration: 1, description: 'O alvo perde sua próxima ação e não pode realizar reações.' },
    { name: 'Caído', duration: 0, description: 'O alvo está derrubado. Defesa reduzida. Gasta metade do movimento para levantar.' },
    { name: 'Fortificado', duration: 3, description: 'O alvo tem +2 na Defesa/CA temporariamente.' },
    { name: 'Armadura Quebrada', duration: 0, description: 'A armadura do alvo foi danificada. -2 na Defesa/CA permanentemente até reparo.' },
];

const StatusBadge: React.FC<{ status: StatusEffect, onRemove?: () => void }> = ({ status, onRemove }) => (
    <div className="group relative flex items-center gap-1 bg-red-900/40 text-red-200 border border-red-700/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider cursor-help hover:bg-red-900/60 transition-colors">
        <AlertCircle size={8} /> {status.name}
        {onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-1 hover:text-white text-red-400">
                <XCircle size={8} />
            </button>
        )}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-950 border border-slate-800 p-2 rounded shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
            <div className="text-amber-400 mb-1 border-b border-slate-800 pb-1 flex items-center justify-between">
                <span>{status.name}</span>
                <span className="text-[8px] flex items-center gap-1"><Clock size={8}/> {status.duration > 0 ? `${status.duration} T` : '∞'}</span>
            </div>
            <p className="text-slate-300 font-normal normal-case leading-tight text-[9px]">{status.description}</p>
        </div>
    </div>
);

const MapPin = ({ symbol, label, type = 'poi' }: { symbol: string, label?: string, type?: 'poi' | 'actor' }) => (
    <div className="relative flex flex-col items-center justify-end -mt-8 z-10 group">
        <div className={`relative flex items-center justify-center w-8 h-10 transition-transform duration-200 hover:-translate-y-1 hover:scale-110`}>
            <svg viewBox="0 0 24 24" className={`w-full h-full drop-shadow-md ${type === 'actor' ? 'text-red-900' : 'text-slate-900'}`} fill="currentColor">
               <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            </svg>
            <span className="absolute top-1.5 text-sm leading-none drop-shadow-sm select-none">{symbol}</span>
        </div>
        {label && (
            <div className="absolute top-full mt-1 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none border border-slate-700">
                {label}
            </div>
        )}
        <div className="w-4 h-1 bg-black/40 rounded-full blur-[1px] mt-[-2px]"></div>
    </div>
);

export const NarrativeView: React.FC<NarrativeViewProps> = ({ 
    characters: initialCharacters, 
    initialHistory, 
    worldData, 
    initialEnemies,
    karmicDiceEnabled = true,
    initialMapData,
    onStateChange
}) => {
  const [activeCharacters, setActiveCharacters] = useState<Character[]>(initialCharacters.map(c => ({...c, status: c.status || []})));
  const [history, setHistory] = useState<NarrativeTurn[]>(initialHistory);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [selectedDice, setSelectedDice] = useState<Record<string, DiceType>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [gameResult, setGameResult] = useState<'victory' | 'defeat' | null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>(initialEnemies?.map(e => ({...e, status: e.status || []})) || []);
  const [activeTab, setActiveTab] = useState<'combat' | 'map' | 'character' | 'inventory' | 'logs'>('combat');
  const [mechanicLogs, setMechanicLogs] = useState<MechanicLog[]>([]);
  const [mapData, setMapData] = useState<MapData | null>(initialMapData || null);
  const [karmaMap, setKarmaMap] = useState<Record<string, number>>({});

  // UI state for adding statuses
  const [addingStatusTo, setAddingStatusTo] = useState<{id: string, type: 'enemy' | 'character'} | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const logsBottomRef = useRef<HTMLDivElement>(null);
  const diceOptions: DiceType[] = ['D4', 'D6', 'D8', 'D10', 'D12', 'D20', 'D100'];

  // Atualiza a música inicial
  useEffect(() => {
    onStateChange(enemies.length > 0, null);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);
  useEffect(() => { if (activeTab === 'logs') logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mechanicLogs, activeTab]);

  const addLog = (source: string, content: string, type: MechanicLog['type'], value?: number) => {
      setMechanicLogs(prev => [...prev, { id: crypto.randomUUID(), timestamp: Date.now(), source, content, type, value }]);
  };

  const handleAddStatus = (targetId: string, type: 'enemy' | 'character', status: StatusEffect) => {
      if (type === 'enemy') {
          setEnemies(prev => prev.map(e => {
              if (e.id === targetId) {
                  return { ...e, status: [...(e.status || []), status] };
              }
              return e;
          }));
          addLog('GM', `Aplicou ${status.name} em Inimigo`, 'system-info');
      } else {
          setActiveCharacters(prev => prev.map(c => {
              if (c.id === targetId) {
                  return { ...c, status: [...(c.status || []), status] };
              }
              return c;
          }));
          addLog('GM', `Aplicou ${status.name} em ${activeCharacters.find(c => c.id === targetId)?.name}`, 'system-info');
      }
      setAddingStatusTo(null);
  };

  const handleRemoveStatus = (targetId: string, type: 'enemy' | 'character', index: number) => {
      if (type === 'enemy') {
          setEnemies(prev => prev.map(e => {
              if (e.id === targetId) {
                  const newStatus = [...(e.status || [])];
                  newStatus.splice(index, 1);
                  return { ...e, status: newStatus };
              }
              return e;
          }));
      } else {
          setActiveCharacters(prev => prev.map(c => {
              if (c.id === targetId) {
                  const newStatus = [...(c.status || [])];
                  newStatus.splice(index, 1);
                  return { ...c, status: newStatus };
              }
              return c;
          }));
      }
  };

  const rollDie = (type: DiceType, entityId: string): number => {
    const sides = parseInt(type.substring(1));
    let result = Math.floor(Math.random() * sides) + 1;
    if (karmicDiceEnabled) {
        const streak = karmaMap[entityId] || 0;
        if (streak <= -2) result = Math.max(result, Math.floor(Math.random() * sides) + 1);
        else if (streak >= 2) result = Math.min(result, Math.floor(Math.random() * sides) + 1);
    }
    const threshold = Math.ceil(sides / 2);
    const isSuccess = result > threshold;
    setKarmaMap(prev => {
        const currentStreak = prev[entityId] || 0;
        return { ...prev, [entityId]: isSuccess ? (currentStreak >= 0 ? Math.min(currentStreak + 1, 5) : 1) : (currentStreak <= 0 ? Math.max(currentStreak - 1, -5) : -1) };
    });
    return result;
  };

  const submitTurn = async () => {
    if (!worldData) return;
    const turnPlayerRolls: Record<string, RollResult> = {};
    activeCharacters.forEach(c => {
      const dieType = selectedDice[c.id] || 'D20';
      const result = rollDie(dieType, c.id);
      turnPlayerRolls[c.id] = { type: dieType, value: result };
      addLog(c.name, `Rolagem de Teste (${dieType})`, 'player-roll', result);
    });
    const turnEnemyRolls: Record<string, RollResult> = {};
    enemies.forEach(e => {
        const result = rollDie('D20', e.id);
        turnEnemyRolls[e.id] = { type: 'D20', value: result };
        addLog(e.name, `Teste de Oposição (D20)`, 'enemy-roll', result);
    });
    setHistory(prev => [...prev, { role: 'player', content: activeCharacters.map(c => `> **${c.name}**: ${actions[c.id] || "Aguarda..."}`).join('\n'), timestamp: Date.now() }]);
    setActions({});
    setIsProcessing(true);
    try {
      const response: TurnResponse = await processTurn(history, activeCharacters.map(c => ({name: c.name, action: actions[c.id] || ""})), activeCharacters, turnPlayerRolls, worldData, enemies, turnEnemyRolls);
      let updatedCharacters = [...activeCharacters];
      if (response.resourceChanges) {
        response.resourceChanges.forEach(change => {
          const charIndex = updatedCharacters.findIndex(c => c.name === change.characterName);
          if (charIndex !== -1) {
              const res = change.resource;
              updatedCharacters[charIndex] = { ...updatedCharacters[charIndex], derived: { ...updatedCharacters[charIndex].derived, [res]: Math.max(0, updatedCharacters[charIndex].derived[res] + change.value) } };
              addLog('Sistema', `${change.characterName}: ${res.toUpperCase()} ${change.value > 0 ? '+' : ''}${change.value}`, change.value < 0 ? 'damage' : 'gain');
          }
        });
      }
      if (response.inventoryUpdates) {
        response.inventoryUpdates.forEach(update => {
          const charIndex = updatedCharacters.findIndex(c => c.name === update.characterName);
          if (charIndex !== -1) {
              const char = updatedCharacters[charIndex];
              if (update.action === 'ADD') {
                  char.items = [...char.items, update.item];
                  addLog('Loot', `${char.name} obteve ${update.item.name}`, 'gain');
              } else if (update.action === 'REMOVE') {
                  char.items = char.items.filter(i => i.name !== update.item.name);
                  addLog('Perda', `${char.name} perdeu ${update.item.name}`, 'damage');
              }
          }
        });
      }
      if (response.characterStatusUpdates) {
          response.characterStatusUpdates.forEach(update => {
              const charIndex = updatedCharacters.findIndex(c => c.name === update.characterName);
              if (charIndex !== -1) updatedCharacters[charIndex].status = update.status;
          });
      }
      setActiveCharacters(updatedCharacters);
      
      // Update Enemies and Music State
      if (response.activeEnemies) {
          setEnemies(response.activeEnemies.map(e => ({...e, status: e.status || []})));
      }
      if (response.mapData) setMapData(response.mapData);
      setHistory(prev => [...prev, { role: 'gm', content: response.storyText, timestamp: Date.now() + 100 }]);
      
      const newGameResult = response.isGameOver && response.gameResult ? (response.gameResult === 'VICTORY' ? 'victory' : 'defeat') : null;
      if (newGameResult) setGameResult(newGameResult);

      // Notify App about state changes for Music
      onStateChange(
        (response.activeEnemies && response.activeEnemies.length > 0) || false,
        newGameResult
      );

    } catch (error) {
      setHistory(prev => [...prev, { role: 'gm', content: "Erro na conexão divina...", timestamp: Date.now() }]);
    } finally { setIsProcessing(false); }
  };

  const getHpPercent = (curr: number, max: number) => Math.min(100, Math.max(0, (curr / max) * 100));
  const hasBackpack = (char: Character) => char.items.some(i => i.name.toLowerCase().includes('mochila'));
  const getInventoryLimit = (char: Character) => hasBackpack(char) ? 10 : 5;

  if (gameResult) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] animate-fade-in text-center p-8 space-y-6">
        <div className={`p-8 rounded-full border-4 ${gameResult === 'victory' ? 'bg-amber-500/10 border-amber-500' : 'bg-red-900/20 border-red-600'}`}>
          {gameResult === 'victory' ? <Trophy size={80} className="text-amber-500" /> : <Skull size={80} className="text-red-600" />}
        </div>
        <h2 className="text-5xl font-cinzel font-bold text-white">{gameResult === 'victory' ? 'Vitória Lendária' : 'Destino Trágico'}</h2>
        <Button onClick={() => window.location.reload()} className="mt-8 px-8 py-3 text-lg">Jogar Novamente</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-100px)] max-w-7xl mx-auto gap-4">
      <div className="flex flex-col flex-1 bg-slate-900/50 rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative order-2 md:order-1">
        {worldData && (
          <div className="bg-slate-950/80 backdrop-blur-sm border-b border-amber-900/30 p-2 flex items-center justify-center gap-2 text-center shadow-md absolute top-0 left-0 right-0 z-20">
            <Target size={14} className="text-amber-500" />
            <span className="text-xs uppercase tracking-widest text-amber-500/70 font-bold">Objetivo:</span>
            <span className="text-xs text-amber-100 font-bold">{worldData.mainObjective}</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pt-12">
          {history.map((turn, index) => (
             turn.role !== 'system' && (
                <div key={index} className={`flex flex-col ${turn.role === 'gm' ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[90%] md:max-w-[80%] rounded-lg p-5 ${turn.role === 'gm' ? 'bg-slate-800 border-l-4 border-amber-500 text-slate-200' : 'bg-slate-700/50 border-r-4 border-blue-500 text-slate-300'}`}>
                      <div className="text-xs uppercase tracking-widest opacity-50 mb-2 font-bold flex items-center gap-2">{turn.role === 'gm' ? "Mestre de Jogo" : <><ScrollText size={14} /> Narrativa do Grupo</>}</div>
                      <div className="whitespace-pre-wrap font-serif leading-relaxed">{turn.content}</div>
                    </div>
                </div>
             )
          ))}
          {isProcessing && <div className="flex items-center gap-2 text-amber-500 animate-pulse p-4"><span className="h-2 w-2 bg-amber-500 rounded-full"></span><span className="h-2 w-2 bg-amber-500 rounded-full animation-delay-200"></span><span className="h-2 w-2 bg-amber-500 rounded-full animation-delay-400"></span><span className="text-sm font-cinzel">O destino está sendo escrito...</span></div>}
          <div ref={bottomRef} />
        </div>
        <div className="bg-slate-950 border-t border-slate-800 p-4 md:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
          <div className="grid grid-cols-1 gap-4 mb-4">
            {activeCharacters.map((char) => (
              <div key={char.id} className="bg-slate-900 border border-slate-800 rounded-lg p-1">
                <div className="flex items-center justify-between px-2 py-1 mb-1">
                  <div className="text-xs font-bold text-blue-400 flex items-center gap-1"><User size={10} /> {char.name}</div>
                  <div className="relative group/dice">
                    <select value={selectedDice[char.id] || 'D20'} onChange={(e) => setSelectedDice(prev => ({ ...prev, [char.id]: e.target.value as DiceType }))} className="bg-slate-800 text-amber-500 text-[10px] font-bold py-1 px-2 rounded border border-slate-700 outline-none cursor-pointer appearance-none pr-6 hover:border-amber-500 transition-colors">
                      {diceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <ChevronDown size={10} className="absolute right-1 top-1.5 text-amber-500 pointer-events-none" />
                  </div>
                </div>
                <textarea value={actions[char.id] || ''} onChange={(e) => setActions(prev => ({ ...prev, [char.id]: e.target.value }))} placeholder={`O que ${char.name} faz?`} rows={2} disabled={isProcessing} className="w-full bg-slate-950/50 rounded p-2 text-sm text-slate-200 focus:bg-slate-900 outline-none resize-none border-none"/>
              </div>
            ))}
          </div>
          <Button onClick={submitTurn} disabled={isProcessing} variant={activeCharacters.every(c => (actions[c.id] || '').length > 0) ? 'primary' : 'secondary'} className="w-full">Enviar Turno</Button>
        </div>
      </div>
      <div className="w-full md:w-80 bg-slate-900/50 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col order-1 md:order-2">
        <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-hide">
            {['combat', 'map', 'character', 'inventory', 'logs'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center transition-colors ${activeTab === tab ? 'bg-slate-800 text-amber-500' : 'bg-slate-950 text-slate-500'}`}>
                    {tab === 'combat' && <Sword size={14} />}
                    {tab === 'map' && <MapIcon size={14} />}
                    {tab === 'character' && <User size={14} />}
                    {tab === 'inventory' && <Backpack size={14} />}
                    {tab === 'logs' && <ClipboardList size={14} />}
                </button>
            ))}
        </div>
        <div className="p-4 space-y-6 flex-1 overflow-y-auto bg-slate-900/30">
            {activeTab === 'combat' && (
                <div className="space-y-4 animate-fade-in">
                    <h4 className="text-xs text-slate-400 font-bold uppercase mb-3">Inimigos Ativos</h4>
                    {enemies.length === 0 ? <div className="text-center py-4 border border-dashed border-slate-800 rounded text-slate-600 text-xs italic">Cena tranquila...</div> : (
                        enemies.map((enemy, idx) => (
                            <div key={idx} className="bg-slate-950 border border-slate-800 rounded p-2 space-y-2 relative">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-slate-200">{enemy.name}</span>
                                    <span className={`text-[8px] px-1.5 rounded uppercase font-bold text-slate-900 ${enemy.difficulty === 'Boss' ? 'bg-amber-500' : 'bg-slate-400'}`}>{enemy.difficulty}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative"><div className={`h-full transition-all duration-500 ${getHpPercent(enemy.currentHp, enemy.maxHp) < 30 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${getHpPercent(enemy.currentHp, enemy.maxHp)}%` }}/></div>
                                <div className="flex flex-wrap items-center gap-1 mt-1 min-h-[20px]">
                                    {enemy.status?.map((st, i) => (
                                        <StatusBadge 
                                            key={i} 
                                            status={st} 
                                            onRemove={() => handleRemoveStatus(enemy.id, 'enemy', i)} 
                                        />
                                    ))}
                                    <div className="relative">
                                        <button 
                                            onClick={() => setAddingStatusTo(addingStatusTo?.id === enemy.id ? null : {id: enemy.id, type: 'enemy'})}
                                            className="text-slate-500 hover:text-amber-500 transition-colors bg-slate-900 border border-slate-700 rounded-full p-0.5"
                                            title="Adicionar Status"
                                        >
                                            <Plus size={10} />
                                        </button>
                                        {addingStatusTo?.id === enemy.id && addingStatusTo.type === 'enemy' && (
                                            <div className="absolute top-full left-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded shadow-xl z-50 animate-fade-in max-h-48 overflow-y-auto">
                                                {AVAILABLE_STATUSES.map(st => (
                                                    <button 
                                                        key={st.name} 
                                                        className="w-full text-left px-2 py-1.5 text-[9px] hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 last:border-0"
                                                        onClick={() => handleAddStatus(enemy.id, 'enemy', st)}
                                                    >
                                                        {st.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
            {activeTab === 'character' && (
                <div className="animate-fade-in space-y-4">
                    <h4 className="text-xs text-blue-400 font-bold uppercase mb-3 flex items-center gap-2"><ShieldCheck size={14}/> Ficha do Grupo</h4>
                    {activeCharacters.map(char => (
                        <div key={char.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                            <h5 className="font-cinzel text-blue-200 text-xs font-bold">{char.name}</h5>
                            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono border-y border-slate-800/30 py-1">
                                <span className="text-red-400 flex items-center gap-1"><Heart size={10}/> {char.derived.hp}</span>
                                <span className="text-blue-400 flex items-center gap-1"><Droplets size={10}/> {char.derived.mana}</span>
                                <span className="text-green-400 flex items-center gap-1"><Flame size={10}/> {char.derived.stamina}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 min-h-[20px]">
                                {char.status?.map((st, i) => (
                                    <StatusBadge 
                                        key={i} 
                                        status={st}
                                        onRemove={() => handleRemoveStatus(char.id, 'character', i)}
                                    />
                                ))}
                                <div className="relative">
                                    <button 
                                        onClick={() => setAddingStatusTo(addingStatusTo?.id === char.id ? null : {id: char.id, type: 'character'})}
                                        className="text-slate-500 hover:text-blue-400 transition-colors bg-slate-900 border border-slate-700 rounded-full p-0.5"
                                        title="Adicionar Status"
                                    >
                                        <Plus size={10} />
                                    </button>
                                    {addingStatusTo?.id === char.id && addingStatusTo.type === 'character' && (
                                        <div className="absolute top-full left-0 mt-1 w-40 bg-slate-900 border border-slate-700 rounded shadow-xl z-50 animate-fade-in max-h-48 overflow-y-auto">
                                            {AVAILABLE_STATUSES.map(st => (
                                                <button 
                                                    key={st.name} 
                                                    className="w-full text-left px-2 py-1.5 text-[9px] hover:bg-slate-800 text-slate-300 hover:text-white border-b border-slate-800 last:border-0"
                                                    onClick={() => handleAddStatus(char.id, 'character', st)}
                                                >
                                                    {st.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {activeTab === 'inventory' && (
                <div className="animate-fade-in space-y-6">
                    <h4 className="text-xs text-amber-500 font-bold uppercase mb-3 flex items-center gap-2"><Backpack size={14}/> Inventário</h4>
                    {activeCharacters.map(char => (
                        <div key={char.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                                <h5 className="font-cinzel text-amber-100 text-[10px] font-bold">{char.name}</h5>
                                <span className={`text-[10px] font-bold ${char.items.length >= getInventoryLimit(char) ? 'text-red-500' : 'text-slate-500'}`}>{char.items.length}/{getInventoryLimit(char)}</span>
                            </div>
                            <div className="space-y-1">
                                {char.items.map((item, i) => (
                                    <div key={i} className="bg-slate-900/50 p-1 rounded text-[9px] flex flex-col">
                                        <span className="font-bold text-slate-200">{item.name}</span>
                                        <span className="text-amber-500/70">{item.effect}</span>
                                    </div>
                                ))}
                                {char.items.length === 0 && <span className="text-[9px] text-slate-700 italic">Vazio...</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {activeTab === 'map' && mapData && (
                <div className="animate-fade-in flex flex-col h-full space-y-4">
                    <h4 className="text-xs text-green-500/80 font-bold uppercase mb-3 flex items-center gap-2"><Compass size={12} /> Cartografia</h4>
                    <div className="bg-slate-950 border border-slate-800 rounded p-2 text-center shadow-inner"><h5 className="font-cinzel text-amber-100 text-xs font-bold truncate">{mapData.locationName}</h5></div>
                    <div className="relative aspect-square w-full bg-[#e2d1b3] overflow-hidden rounded shadow-2xl border-4 border-amber-900/40">
                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/handmade-paper.png')]"></div>
                        <div className="absolute inset-0 grid grid-cols-5 grid-rows-5 p-4 z-0">
                            {mapData.grid.map((row, rIdx) => (row.map((cell, cIdx) => (
                                <div key={`${rIdx}-${cIdx}`} className="flex items-center justify-center relative border-[0.2px] border-black/5">
                                    {cell === '.' ? <div className="text-[8px] text-black/10 font-bold">+</div> : <MapPin symbol={cell} label={mapData.legend.find(l => l.symbol === cell)?.description} type={['👹', '👤'].some(e => cell.includes(e)) ? 'actor' : 'poi'} />}
                                </div>
                            ))))}
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'logs' && (
                <div className="h-full flex flex-col animate-fade-in space-y-2">
                    <h4 className="text-xs text-purple-400 font-bold uppercase mb-3 flex items-center gap-2"><Dices size={12} /> Log de Batalha</h4>
                    {mechanicLogs.map((log) => (
                        <div key={log.id} className="bg-slate-950/80 p-2 rounded border border-slate-800 text-[10px] space-y-1">
                            <div className="flex justify-between font-bold"><span className={log.type === 'player-roll' ? 'text-blue-300' : 'text-red-300'}>{log.source}</span><span>{log.value}</span></div>
                            <div className="text-slate-400 leading-tight">{log.content}</div>
                        </div>
                    ))}
                    <div ref={logsBottomRef} />
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
