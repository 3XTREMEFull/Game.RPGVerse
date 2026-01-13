
import React, { useState, useRef, useEffect } from 'react';
import { Character, NarrativeTurn, DiceType, RollResult, WorldData, TurnResponse, Enemy, MapData } from '../types';
import { processTurn } from '../services/geminiService';
import { Button } from './Button';
import { Send, User, Sparkles, Activity, Dices, ChevronDown, Target, Trophy, Skull, Backpack, Heart, Flame, Droplets, Sword, ClipboardList, ScrollText, Map as MapIcon, Compass, ShieldCheck, Box } from 'lucide-react';

interface NarrativeViewProps {
  characters: Character[];
  initialHistory: NarrativeTurn[];
  worldData?: WorldData;
  initialEnemies?: Enemy[];
  karmicDiceEnabled?: boolean;
  initialMapData?: MapData; 
}

interface MechanicLog {
  id: string;
  timestamp: number;
  source: string;
  content: string;
  type: 'player-roll' | 'enemy-roll' | 'system-info' | 'damage' | 'gain';
  value?: number; 
}

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
    initialMapData
}) => {
  const [activeCharacters, setActiveCharacters] = useState<Character[]>(initialCharacters);
  const [history, setHistory] = useState<NarrativeTurn[]>(initialHistory);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [selectedDice, setSelectedDice] = useState<Record<string, DiceType>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [gameResult, setGameResult] = useState<'victory' | 'defeat' | null>(null);
  
  const [enemies, setEnemies] = useState<Enemy[]>(initialEnemies || []);
  const [activeTab, setActiveTab] = useState<'combat' | 'logs' | 'map' | 'character' | 'inventory'>('combat');
  const [mechanicLogs, setMechanicLogs] = useState<MechanicLog[]>([]);
  const [mapData, setMapData] = useState<MapData | null>(initialMapData || null);
  const [karmaMap, setKarmaMap] = useState<Record<string, number>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const logsBottomRef = useRef<HTMLDivElement>(null);

  const diceOptions: DiceType[] = ['D4', 'D6', 'D8', 'D10', 'D12', 'D20', 'D100'];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    if (activeTab === 'logs') {
        logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mechanicLogs, activeTab]);

  const handleActionChange = (charId: string, value: string) => {
    setActions(prev => ({ ...prev, [charId]: value }));
  };

  const handleDiceChange = (charId: string, type: DiceType) => {
    setSelectedDice(prev => ({ ...prev, [charId]: type }));
  };

  const addLog = (source: string, content: string, type: MechanicLog['type'], value?: number) => {
      const newLog: MechanicLog = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          source,
          content,
          type,
          value
      };
      setMechanicLogs(prev => [...prev, newLog]);
  };

  const rollDie = (type: DiceType, entityId: string): number => {
    const sides = parseInt(type.substring(1));
    let result = Math.floor(Math.random() * sides) + 1;

    if (karmicDiceEnabled) {
        const streak = karmaMap[entityId] || 0;
        if (streak <= -2) {
             const secondRoll = Math.floor(Math.random() * sides) + 1;
             result = Math.max(result, secondRoll);
        } else if (streak >= 2) {
             const secondRoll = Math.floor(Math.random() * sides) + 1;
             result = Math.min(result, secondRoll);
        }
    }

    const threshold = Math.ceil(sides / 2);
    const isSuccess = result > threshold;

    setKarmaMap(prev => {
        const currentStreak = prev[entityId] || 0;
        let newStreak = 0;
        if (isSuccess) {
            newStreak = currentStreak >= 0 ? Math.min(currentStreak + 1, 5) : 1;
        } else {
            newStreak = currentStreak <= 0 ? Math.max(currentStreak - 1, -5) : -1;
        }
        return { ...prev, [entityId]: newStreak };
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

    const playerTurnContent = activeCharacters.map(c => {
      const action = actions[c.id] || "Aguarda hesitante...";
      return `> **${c.name}**: ${action}`;
    }).join('\n');

    const newHistory = [
      ...history,
      { role: 'player' as const, content: playerTurnContent, timestamp: Date.now() }
    ];

    setHistory(newHistory);
    setActions({});
    setIsProcessing(true);
    
    try {
      const formattedActions = activeCharacters.map(c => ({
        name: c.name,
        action: actions[c.id] || "não faz nada especificamente."
      }));

      const response: TurnResponse = await processTurn(
          newHistory, 
          formattedActions, 
          activeCharacters, 
          turnPlayerRolls, 
          worldData, 
          enemies, 
          turnEnemyRolls
      );

      const updatedCharacters = [...activeCharacters];

      if (response.activeEnemies) setEnemies(response.activeEnemies);
      if (response.mapData) setMapData(response.mapData);

      if (response.attributeChanges) {
        response.attributeChanges.forEach(change => {
          const charIndex = updatedCharacters.findIndex(c => c.name === change.characterName);
          if (charIndex !== -1) {
              updatedCharacters[charIndex] = {
                  ...updatedCharacters[charIndex],
                  attributes: {
                      ...updatedCharacters[charIndex].attributes,
                      [change.attribute]: Math.max(1, updatedCharacters[charIndex].attributes[change.attribute] + change.value)
                  }
              };
              const symbol = change.value > 0 ? '+' : '';
              addLog('Sistema', `${change.characterName}: ${change.attribute} ${symbol}${change.value} (${change.reason})`, 'system-info');
          }
        });
      }

      if (response.resourceChanges) {
        response.resourceChanges.forEach(change => {
          const charIndex = updatedCharacters.findIndex(c => c.name === change.characterName);
          if (charIndex !== -1) {
              const char = updatedCharacters[charIndex];
              const newValue = Math.max(0, char.derived[change.resource] + change.value);
              updatedCharacters[charIndex] = {
                  ...char,
                  derived: { ...char.derived, [change.resource]: newValue }
              };
              const resourceName = change.resource === 'hp' ? 'Vida' : change.resource === 'mana' ? 'Mana' : 'Estamina';
              const isDamage = change.value < 0;
              addLog('Sistema', `${char.name}: ${resourceName} ${change.value > 0 ? '+' : ''}${change.value}`, isDamage ? 'damage' : 'gain');
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

      setActiveCharacters(updatedCharacters);
      setHistory(prev => [...prev, { role: 'gm', content: response.storyText, timestamp: Date.now() + 100 }]);
      if (response.isGameOver && response.gameResult) setGameResult(response.gameResult === 'VICTORY' ? 'victory' : 'defeat');

    } catch (error) {
      console.error(error);
      setHistory(prev => [...prev, { role: 'gm' as const, content: "Erro na conexão divina...", timestamp: Date.now() }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const getHpPercent = (curr: number, max: number) => Math.min(100, Math.max(0, (curr / max) * 100));
  const allPlayersReady = activeCharacters.every(c => (actions[c.id] || '').length > 0);

  if (gameResult) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] animate-fade-in text-center p-8 space-y-6">
        <div className={`p-8 rounded-full border-4 ${gameResult === 'victory' ? 'bg-amber-500/10 border-amber-500' : 'bg-red-900/20 border-red-600'}`}>
          {gameResult === 'victory' ? <Trophy size={80} className="text-amber-500" /> : <Skull size={80} className="text-red-600" />}
        </div>
        <h2 className="text-5xl font-cinzel font-bold text-white">{gameResult === 'victory' ? 'Vitória Lendária' : 'Destino Trágico'}</h2>
        <p className="text-xl text-slate-300 max-w-2xl font-serif">
          {gameResult === 'victory' ? `O grupo alcançou o objetivo: "${worldData?.mainObjective}".` : `A jornada chegou ao fim trágico.`}
        </p>
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
          {history.map((turn, index) => {
              if (turn.role === 'system') return null;
              const isGm = turn.role === 'gm';
              return (
                  <div key={index} className={`flex flex-col ${isGm ? 'items-start' : 'items-end'}`}>
                      <div className={`max-w-[90%] md:max-w-[80%] rounded-lg p-5 ${isGm ? 'bg-slate-800 border-l-4 border-amber-500 text-slate-200' : 'bg-slate-700/50 border-r-4 border-blue-500 text-slate-300'}`}>
                        <div className="text-xs uppercase tracking-widest opacity-50 mb-2 font-bold flex items-center gap-2">
                          {isGm ? "Mestre de Jogo" : <><ScrollText size={14} /> Narrativa do Grupo</>}
                        </div>
                        <div className="whitespace-pre-wrap font-serif leading-relaxed">{turn.content}</div>
                      </div>
                  </div>
              );
          })}
          {isProcessing && (
            <div className="flex items-center gap-2 text-amber-500 animate-pulse p-4">
              <span className="h-2 w-2 bg-amber-500 rounded-full"></span>
              <span className="h-2 w-2 bg-amber-500 rounded-full animation-delay-200"></span>
              <span className="h-2 w-2 bg-amber-500 rounded-full animation-delay-400"></span>
              <span className="text-sm font-cinzel">O destino está sendo escrito...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="bg-slate-950 border-t border-slate-800 p-4 md:p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
          <h3 className="text-sm uppercase tracking-widest text-slate-500 mb-4 font-bold flex items-center gap-2"><Send size={14} /> Declarar Ações</h3>
          <div className="grid grid-cols-1 gap-4 mb-4">
            {activeCharacters.map((char) => (
              <div key={char.id} className="relative group bg-slate-900 border border-slate-800 rounded-lg p-1">
                <div className="flex items-center justify-between px-2 py-1 mb-1">
                  <div className="text-xs font-bold text-blue-400 flex items-center gap-1"><User size={10} /> {char.name}</div>
                  <div className="flex gap-2 items-center">
                    <div className="relative group/dice">
                        <select value={selectedDice[char.id] || 'D20'} onChange={(e) => handleDiceChange(char.id, e.target.value as DiceType)} className="bg-slate-800 text-amber-500 text-[10px] font-bold py-1 px-2 rounded border border-slate-700 outline-none cursor-pointer appearance-none pr-6 hover:border-amber-500 transition-colors">
                          {diceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1 top-1.5 text-amber-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
                <textarea value={actions[char.id] || ''} onChange={(e) => handleActionChange(char.id, e.target.value)} placeholder={`O que ${char.name} faz?`} rows={2} disabled={isProcessing} className="w-full bg-slate-950/50 rounded p-2 text-sm text-slate-200 focus:bg-slate-900 outline-none resize-none border-none"/>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={submitTurn} disabled={isProcessing} variant={allPlayersReady ? 'primary' : 'secondary'} className="w-full md:w-auto px-8">Enviar Turno</Button>
          </div>
        </div>
      </div>
      <div className="w-full md:w-80 bg-slate-900/50 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col order-1 md:order-2">
        <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-hide">
            <button onClick={() => setActiveTab('combat')} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeTab === 'combat' ? 'bg-slate-800 text-amber-500' : 'bg-slate-950 text-slate-500'}`} title="Combate"><Sword size={14} /></button>
            <button onClick={() => setActiveTab('map')} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeTab === 'map' ? 'bg-slate-800 text-green-400' : 'bg-slate-950 text-slate-500'}`} title="Mapa"><MapIcon size={14} /></button>
            <button onClick={() => setActiveTab('character')} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeTab === 'character' ? 'bg-slate-800 text-blue-400' : 'bg-slate-950 text-slate-500'}`} title="Ficha"><User size={14} /></button>
            <button onClick={() => setActiveTab('inventory')} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeTab === 'inventory' ? 'bg-slate-800 text-amber-100' : 'bg-slate-950 text-slate-500'}`} title="Mochila"><Backpack size={14} /></button>
            <button onClick={() => setActiveTab('logs')} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors ${activeTab === 'logs' ? 'bg-slate-800 text-purple-400' : 'bg-slate-950 text-slate-500'}`} title="Logs"><ClipboardList size={14} /></button>
        </div>
        <div className="p-4 space-y-6 flex-1 overflow-y-auto bg-slate-900/30">
            {activeTab === 'combat' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h4 className="text-xs text-slate-400 font-bold uppercase mb-3 flex items-center justify-between">Inimigos Ativos <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-500">{enemies.length}</span></h4>
                        {enemies.length === 0 ? <div className="text-center py-4 border border-dashed border-slate-800 rounded text-slate-600 text-xs italic">Nenhum inimigo visível.</div> : (
                            <div className="space-y-3">
                                {enemies.map((enemy, idx) => {
                                    const hpPercent = getHpPercent(enemy.currentHp, enemy.maxHp);
                                    return (
                                        <div key={idx} className="bg-slate-950 border border-slate-800 rounded p-2 relative overflow-hidden">
                                            <div className="flex justify-between items-center mb-1"><span className="text-sm font-bold text-slate-200">{enemy.name}</span><span className={`text-[9px] px-1.5 rounded uppercase font-bold text-slate-900 ${enemy.difficulty === 'Boss' ? 'bg-amber-500' : enemy.difficulty === 'Elite' ? 'bg-purple-400' : 'bg-slate-400'}`}>{enemy.difficulty}</span></div>
                                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative"><div className={`h-full transition-all duration-500 ${hpPercent < 30 ? 'bg-red-500' : hpPercent < 60 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${hpPercent}%` }}/></div>
                                            <div className="flex justify-between mt-1 text-[10px] text-slate-500"><span>HP: {enemy.currentHp}/{enemy.maxHp}</span></div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {activeTab === 'character' && (
                <div className="animate-fade-in space-y-6">
                    <h4 className="text-xs text-blue-400 font-bold uppercase mb-3 flex items-center gap-2"><ShieldCheck size={14}/> Ficha do Grupo</h4>
                    {activeCharacters.map(char => (
                        <div key={char.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-3 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1 h-full bg-blue-500/30"></div>
                            <div>
                                <h5 className="font-cinzel text-blue-200 text-sm font-bold">{char.name}</h5>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{char.concept}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono border-y border-slate-800/50 py-2">
                                <span className="text-red-400 flex items-center gap-1"><Heart size={10}/> {char.derived.hp}</span>
                                <span className="text-blue-400 flex items-center gap-1"><Droplets size={10}/> {char.derived.mana}</span>
                                <span className="text-green-400 flex items-center gap-1"><Flame size={10}/> {char.derived.stamina}</span>
                            </div>
                            <div className="space-y-2">
                                <span className="text-[9px] text-amber-500 font-bold uppercase block">Habilidades Escolhidas</span>
                                {char.skills.map((s, i) => (
                                    <div key={i} className="bg-slate-900/50 p-2 rounded border border-slate-800/50">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-amber-100">{s.name}</span>
                                            <span className="text-[9px] bg-slate-800 px-1 rounded text-slate-400">Nv.{s.level}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-tight italic">"{s.description}"</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {activeTab === 'inventory' && (
                <div className="animate-fade-in space-y-6">
                    <h4 className="text-xs text-amber-500 font-bold uppercase mb-3 flex items-center gap-2"><Backpack size={14}/> Mochila do Grupo</h4>
                    {activeCharacters.map(char => (
                        <div key={char.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-3">
                            <h5 className="font-cinzel text-amber-100 text-sm font-bold border-b border-slate-800 pb-1">{char.name}</h5>
                            {char.items.length === 0 ? (
                                <p className="text-[10px] text-slate-600 italic">Mochila vazia...</p>
                            ) : (
                                <div className="space-y-2">
                                    {char.items.map((item, i) => (
                                        <div key={i} className="bg-slate-900/50 p-2 rounded border border-slate-800/50 flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <Box size={10} className="text-amber-500/50" />
                                                <span className="text-xs font-bold text-slate-200">{item.name}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-tight">{item.description}</p>
                                            <div className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded self-start border border-amber-500/20">
                                                {item.effect}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {activeTab === 'map' && (
                <div className="animate-fade-in flex flex-col h-full">
                    <h4 className="text-xs text-green-500/80 font-bold uppercase mb-3 flex items-center gap-2"><Compass size={12} /> Cartografia</h4>
                    {!mapData ? <div className="text-center py-8 text-slate-600 text-xs italic">Mapeando...</div> : (
                        <div className="space-y-4">
                             <div className="bg-slate-950 border border-slate-800 rounded p-2 text-center shadow-inner"><h5 className="font-cinzel text-amber-100 text-sm font-bold truncate">{mapData.locationName}</h5></div>
                             
                             {/* Fundo do Mapa Estilizado - Pergaminho Ilustrado */}
                             <div className="relative aspect-square w-full bg-[#e2d1b3] overflow-hidden rounded shadow-2xl border-4 border-amber-900/40 ring-4 ring-slate-900 ring-inset">
                                {/* Textura de Papel/Ruído */}
                                <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/handmade-paper.png')]"></div>
                                
                                {/* Ilustrações Topográficas Sutis (Linhas de Relevo) */}
                                <svg className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none" viewBox="0 0 100 100">
                                    <path d="M10,20 Q30,10 50,25 T90,20" fill="none" stroke="black" strokeWidth="0.5" />
                                    <path d="M5,45 Q25,35 45,50 T85,45" fill="none" stroke="black" strokeWidth="0.3" />
                                    <path d="M20,70 Q40,60 60,75 T100,70" fill="none" stroke="black" strokeWidth="0.4" />
                                    <circle cx="20" cy="20" r="15" fill="none" stroke="black" strokeWidth="0.2" strokeDasharray="1 1" />
                                    <circle cx="80" cy="70" r="10" fill="none" stroke="black" strokeWidth="0.2" strokeDasharray="2 1" />
                                </svg>

                                {/* Efeito de Dobra com Sombras Aprimoradas */}
                                <div className="absolute inset-0 pointer-events-none z-10 flex">
                                    <div className="flex-1 border-r border-black/10 bg-gradient-to-r from-transparent via-white/5 to-black/10"></div>
                                    <div className="flex-1 border-r border-black/10 bg-gradient-to-l from-transparent via-white/5 to-black/10"></div>
                                    <div className="flex-1 bg-gradient-to-r from-transparent via-white/5 to-black/5"></div>
                                </div>
                                
                                {/* Manchas de "Tempo" */}
                                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_30%,#8b451311_0%,transparent_50%)]"></div>
                                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_80%_80%,#8b45130a_0%,transparent_40%)]"></div>

                                {/* Conteúdo da Grade */}
                                <div className="absolute inset-0 grid grid-cols-5 grid-rows-5 gap-0 p-4 z-0">
                                    {mapData.grid.map((row, rIdx) => (row.map((cell, cIdx) => (
                                        <div key={`${rIdx}-${cIdx}`} className="flex items-center justify-center relative border-[0.2px] border-black/5">
                                            {cell === '.' ? (
                                                <div className="text-[8px] text-black/10 font-bold select-none">+</div>
                                            ) : (
                                                <MapPin symbol={cell} label={mapData.legend.find(l => l.symbol === cell)?.description} type={['👹', '👤'].some(e => cell.includes(e)) ? 'actor' : 'poi'} />
                                            )}
                                        </div>
                                    ))))}
                                </div>
                             </div>
                             
                             <div className="bg-slate-950/80 rounded border border-slate-800 p-2 shadow-lg backdrop-blur-sm">
                                <div className="grid grid-cols-1 gap-1.5">
                                    {mapData.legend.map((item, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs bg-slate-900/40 p-1.5 rounded border border-slate-800/50">
                                            <span className="text-lg leading-none w-6 text-center select-none">{item.symbol}</span>
                                            <span className="text-slate-300 truncate leading-tight font-serif italic">{item.description}</span>
                                        </div>
                                    ))}
                                </div>
                             </div>
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'logs' && (
                <div className="h-full flex flex-col animate-fade-in">
                     <h4 className="text-xs text-purple-400/80 font-bold uppercase mb-3 flex items-center gap-2"><Dices size={12} /> Registro de Testes</h4>
                    <div className="space-y-2 flex-1">
                        {mechanicLogs.length === 0 ? <div className="text-center py-8 text-slate-600 text-xs italic">Nenhum teste.</div> : (
                            mechanicLogs.map((log) => (
                                <div key={log.id} className="bg-slate-950/80 p-2 rounded border border-slate-800 text-xs">
                                    <div className="flex justify-between mb-1"><span className={`font-bold ${log.type === 'player-roll' ? 'text-blue-300' : 'text-red-300'}`}>{log.source}</span><span className="text-[10px] text-slate-600">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                                    <div className="text-slate-300 flex items-center justify-between"><span>{log.content}</span>{log.value !== undefined && <span className={`font-cinzel text-lg font-bold ml-2 ${log.value === 20 ? 'text-amber-500' : 'text-white'}`}>{log.value}</span>}</div>
                                </div>
                            ))
                        )}
                        <div ref={logsBottomRef} />
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
