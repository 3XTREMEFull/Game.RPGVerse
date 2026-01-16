
import React, { useState, useRef, useEffect } from 'react';
import { Character, NarrativeTurn, DiceType, RollResult, WorldData, TurnResponse, Enemy, MapData, StatusEffect, Item, Ally, EquipmentSlot, TimeData, NeutralNPC } from '../types';
import { processTurn } from '../services/geminiService';
import { Button } from './Button';
import { User, Dices, ChevronDown, Target, Trophy, Skull, Backpack, Heart, Flame, Droplets, Sword, ClipboardList, ScrollText, Map as MapIcon, Compass, ShieldCheck, AlertCircle, Clock, Plus, XCircle, Shield, Hand, ArrowDownToLine, ArrowUpFromLine, Star, Trash, Shirt, Zap, Sun, Moon, Sunrise, Sunset, Coins, ShoppingBag, X, DollarSign, PenTool, Gift } from 'lucide-react';

interface NarrativeViewProps {
  characters: Character[];
  initialHistory: NarrativeTurn[];
  worldData?: WorldData;
  initialEnemies?: Enemy[];
  initialAllies?: Ally[];
  karmicDiceEnabled?: boolean;
  permadeathEnabled?: boolean;
  humanGmEnabled?: boolean;
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
    <div className="relative flex flex-col items-center justify-center z-10 group w-full h-full">
        <div className={`relative flex items-center justify-center w-full h-full transition-transform duration-200 hover:scale-110`}>
            {type === 'actor' ? (
                 <span className="text-xl md:text-2xl drop-shadow-md filter text-slate-900">{symbol}</span>
            ) : (
                 <span className="text-lg md:text-xl drop-shadow-sm text-amber-900/80 font-serif">{symbol}</span>
            )}
        </div>
        {label && (
            <div className="absolute bottom-full mb-1 bg-amber-100 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none border border-amber-300">
                {label}
            </div>
        )}
    </div>
);

// New Header Icons with Tooltip (Corrected alignment)
const HeaderIcon: React.FC<{ icon: React.ReactNode, label: string, value: string, colorClass: string, align?: 'left' | 'right' }> = ({ icon, label, value, colorClass, align = 'right' }) => (
    <div className="relative group flex items-center justify-center p-2 rounded-full hover:bg-slate-800/50 transition-colors cursor-help">
        <div className={`${colorClass} drop-shadow-md`}>{icon}</div>
        <div className={`absolute top-full ${align === 'left' ? 'left-0' : 'right-0'} mt-2 w-48 bg-slate-950 border border-slate-800 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50`}>
            <div className="text-[9px] font-bold uppercase text-slate-500 mb-1">{label}</div>
            <div className={`text-xs font-bold ${colorClass}`}>{value}</div>
        </div>
    </div>
);

export const NarrativeView: React.FC<NarrativeViewProps> = ({ 
    characters: initialCharacters, 
    initialHistory, 
    worldData, 
    initialEnemies,
    initialAllies,
    karmicDiceEnabled = true,
    permadeathEnabled = false,
    humanGmEnabled = false,
    initialMapData,
    onStateChange
}) => {
  const [activeCharacters, setActiveCharacters] = useState<Character[]>(initialCharacters.map(c => ({...c, status: c.status || [], equipment: c.equipment || {}, wealth: c.wealth || 0})));
  const [history, setHistory] = useState<NarrativeTurn[]>(initialHistory);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [gmSuggestion, setGmSuggestion] = useState("");
  const [selectedDice, setSelectedDice] = useState<Record<string, DiceType>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [gameResult, setGameResult] = useState<'victory' | 'defeat' | null>(null);
  const [enemies, setEnemies] = useState<Enemy[]>(initialEnemies?.map(e => ({...e, status: e.status || []})) || []);
  const [activeAllies, setActiveAllies] = useState<Ally[]>(initialAllies?.map(a => ({...a, status: a.status || []})) || []);
  const [activeNeutrals, setActiveNeutrals] = useState<NeutralNPC[]>([]); // New state for Neutrals
  const [nearbyItems, setNearbyItems] = useState<Item[]>([]); 
  const [activeTab, setActiveTab] = useState<'entities' | 'map' | 'character' | 'inventory' | 'logs'>('entities');
  const [mechanicLogs, setMechanicLogs] = useState<MechanicLog[]>([]);
  const [mapData, setMapData] = useState<MapData | null>(initialMapData || null);
  const [karmaMap, setKarmaMap] = useState<Record<string, number>>({});
  const [timeData, setTimeData] = useState<TimeData>({ dayCount: 1, phase: 'DAY', description: 'O dia começa...' });
  
  // Trade Modal State
  const [tradeTarget, setTradeTarget] = useState<NeutralNPC | null>(null);

  // UI state for adding statuses
  const [addingStatusTo, setAddingStatusTo] = useState<{id: string, type: 'enemy' | 'character'} | null>(null);

  // UI state for giving items (Player to Player trade)
  const [givingItem, setGivingItem] = useState<{charId: string, itemIndex: number} | null>(null);

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

  const clearLogs = () => {
    setMechanicLogs([]);
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

  // Inventory & Equipment Logic
  const getInventoryLimit = (char: Character) => {
      const baseLimit = 7;
      const backpackBonus = char.equipment?.back?.capacityBonus || 0;
      return baseLimit + backpackBonus;
  };

  const handleTakeItem = (charId: string, item: Item, itemIndex: number) => {
    if (enemies.length > 0) return; // Bloqueado em combate

    setActiveCharacters(prev => prev.map(c => {
        if (c.id === charId) {
            // Prevent duplicates in character inventory (simple check by name)
            if (c.items.some(i => i.name === item.name)) {
                addLog('Inventário', `${item.name} já está no inventário.`, 'system-info');
                return c;
            }
            if (c.items.length >= getInventoryLimit(c)) return c; // Limite atingido
            return { ...c, items: [...c.items, item] };
        }
        return c;
    }));

    setNearbyItems(prev => prev.filter((_, idx) => idx !== itemIndex));
    addLog('Inventário', `Pegou ${item.name} do chão.`, 'gain');
  };

  const handleDropItem = (charId: string, item: Item, itemIndex: number) => {
    if (enemies.length > 0) return; // Bloqueado em combate

    setActiveCharacters(prev => prev.map(c => {
        if (c.id === charId) {
            return { ...c, items: c.items.filter((_, idx) => idx !== itemIndex) };
        }
        return c;
    }));

    setNearbyItems(prev => [...prev, item]);
    addLog('Inventário', `Jogou ${item.name} no chão.`, 'system-info');
  };

  const handleGiveItem = (sourceCharId: string, targetCharId: string, itemIndex: number) => {
      const sourceChar = activeCharacters.find(c => c.id === sourceCharId);
      const targetChar = activeCharacters.find(c => c.id === targetCharId);
      if (!sourceChar || !targetChar) return;

      const itemToGive = sourceChar.items[itemIndex];
      if (!itemToGive) return;

      if (targetChar.items.length >= getInventoryLimit(targetChar)) {
          addLog('Troca', `${targetChar.name} não tem espaço na mochila.`, 'system-info');
          setGivingItem(null);
          return;
      }

      // Check duplicates
      if (targetChar.items.some(i => i.name === itemToGive.name)) {
          addLog('Troca', `${targetChar.name} já possui esse item.`, 'system-info');
          setGivingItem(null);
          return;
      }

      setActiveCharacters(prev => prev.map(c => {
          if (c.id === sourceCharId) {
              return { ...c, items: c.items.filter((_, idx) => idx !== itemIndex) };
          }
          if (c.id === targetCharId) {
              return { ...c, items: [...c.items, itemToGive] };
          }
          return c;
      }));

      addLog('Troca', `${sourceChar.name} deu ${itemToGive.name} para ${targetChar.name}.`, 'system-info');
      setGivingItem(null);
  };

  const handleUseItem = (charId: string, item: Item, itemIndex: number) => {
      // Allow consumables in combat (Updated as per request)
      
      setActiveCharacters(prev => prev.map(c => {
          if (c.id === charId) {
              const hpMatch = item.effect.match(/(?:recupera|cura|ganha|\+)\s*(\d+)\s*(?:hp|vida)/i);
              const manaMatch = item.effect.match(/(?:recupera|cura|ganha|\+)\s*(\d+)\s*(?:mana|mp)/i);
              const stMatch = item.effect.match(/(?:recupera|cura|ganha|\+)\s*(\d+)\s*(?:stamina|estamina|st)/i);

              let newDerived = { ...c.derived };
              let effectApplied = false;

              if (hpMatch) {
                  const val = parseInt(hpMatch[1]);
                  newDerived.hp += val; 
                  addLog(c.name, `Recuperou ${val} HP com ${item.name}`, 'gain');
                  effectApplied = true;
              }
              if (manaMatch) {
                  const val = parseInt(manaMatch[1]);
                  newDerived.mana += val;
                  addLog(c.name, `Recuperou ${val} Mana com ${item.name}`, 'gain');
                  effectApplied = true;
              }
              if (stMatch) {
                  const val = parseInt(stMatch[1]);
                  newDerived.stamina += val;
                  addLog(c.name, `Recuperou ${val} Estamina com ${item.name}`, 'gain');
                  effectApplied = true;
              }

              if (!effectApplied) {
                  addLog(c.name, `Usou ${item.name}. (Efeito narrativo aplicado)`, 'system-info');
              }

              return { 
                  ...c, 
                  derived: newDerived,
                  items: c.items.filter((_, idx) => idx !== itemIndex) 
              };
          }
          return c;
      }));
  };

  const handleEquipItem = (charId: string, item: Item, itemIndex: number) => {
      if (!item.slot) return;
      setActiveCharacters(prev => prev.map(c => {
          if (c.id === charId) {
              const currentEquipped = c.equipment?.[item.slot!];
              if (currentEquipped) {
                  addLog('Equipamento', `Slot ${item.slot} ocupado. Desequipe primeiro.`, 'system-info');
                  return c;
              }
              const newEquipment = { ...c.equipment, [item.slot!]: item };
              const newItems = c.items.filter((_, idx) => idx !== itemIndex);
              return { ...c, equipment: newEquipment, items: newItems };
          }
          return c;
      }));
      addLog('Equipamento', `Equipou ${item.name}.`, 'gain');
  };

  const handleUnequipItem = (charId: string, slot: EquipmentSlot) => {
      setActiveCharacters(prev => prev.map(c => {
          if (c.id === charId) {
              const item = c.equipment?.[slot];
              if (!item) return c;
              
              if (c.items.length >= getInventoryLimit(c)) {
                  addLog('Equipamento', `Sem espaço na mochila para desequipar.`, 'system-info');
                  return c;
              }

              const newEquipment = { ...c.equipment };
              delete newEquipment[slot];
              return { ...c, equipment: newEquipment, items: [...c.items, item] };
          }
          return c;
      }));
      addLog('Equipamento', `Desequipou item das ${slot}.`, 'system-info');
  };

  const handleBuyItem = (charId: string, item: Item, npcId: string) => {
      if (!item.price) return;
      
      setActiveCharacters(prev => prev.map(c => {
          if (c.id === charId) {
              if (c.wealth < (item.price || 0)) {
                  addLog('Comércio', `Dinheiro insuficiente para comprar ${item.name}.`, 'system-info');
                  return c;
              }
              if (c.items.length >= getInventoryLimit(c)) {
                  addLog('Comércio', `Sem espaço na mochila.`, 'system-info');
                  return c;
              }
              
              addLog('Comércio', `${c.name} comprou ${item.name} por ${item.price}.`, 'gain');
              return {
                  ...c,
                  wealth: c.wealth - (item.price || 0),
                  items: [...c.items, item]
              };
          }
          return c;
      }));
  };

  const handleSellItem = (charId: string, item: Item, itemIndex: number) => {
    if (!tradeTarget) return;
    const sellPrice = Math.floor((item.price || 10) / 2); // Default 5 gold equivalent if no price
    
    setActiveCharacters(prev => prev.map(c => {
        if (c.id === charId) {
            const newItems = c.items.filter((_, idx) => idx !== itemIndex);
            return { ...c, wealth: c.wealth + sellPrice, items: newItems };
        }
        return c;
    }));
    
    // Add item to merchant shop
    setActiveNeutrals(prev => prev.map(n => {
        if (n.id === tradeTarget.id) {
            return { ...n, shopItems: [...(n.shopItems || []), item] };
        }
        return n;
    }));
    // Update local trade target state
    setTradeTarget(prev => prev ? ({...prev, shopItems: [...(prev.shopItems || []), item]}) : null);

    addLog('Comércio', `${activeCharacters.find(c => c.id === charId)?.name} vendeu ${item.name} por ${sellPrice}.`, 'gain');
  };

  const submitTurn = async () => {
    if (!worldData) return;
    const turnPlayerRolls: Record<string, RollResult> = {};
    activeCharacters.forEach(c => {
      // Se morte permanente ativa e HP <= 0, não rola dado
      if (permadeathEnabled && c.derived.hp <= 0) return;

      const dieType = selectedDice[c.id] || 'D20';
      const result = rollDie(dieType, c.id);
      turnPlayerRolls[c.id] = { type: dieType, value: result };
      addLog(c.name, `Tentativa de Ação`, 'player-roll', result);
    });

    const activeCharsForStory = activeCharacters.filter(c => !permadeathEnabled || c.derived.hp > 0);
    const contentLog = activeCharacters.map(c => {
        const action = actions[c.id];
        if (permadeathEnabled && c.derived.hp <= 0) {
            return `> **${c.name}**: (CAÍDO/INCONSCIENTE)`;
        }
        return `> **${c.name}**: ${action || "Aguarda..."}`;
    }).join('\n');

    setHistory(prev => [...prev, { role: 'player', content: contentLog, timestamp: Date.now() }]);
    
    // Preparar ações para enviar (filtrando ou marcando mortos)
    const actionsToSend = activeCharacters.map(c => ({
        name: c.name,
        action: (permadeathEnabled && c.derived.hp <= 0) ? "INCONSCIENTE/CAÍDO" : (actions[c.id] || "")
    }));

    setActions({});
    setGmSuggestion(""); // Limpa sugestão do GM
    setIsProcessing(true);
    try {
      const response: TurnResponse = await processTurn(
          history, 
          actionsToSend, 
          activeCharacters, 
          turnPlayerRolls, 
          worldData, 
          enemies, 
          activeAllies, 
          activeNeutrals, 
          timeData,
          permadeathEnabled,
          gmSuggestion
      );
      let updatedCharacters = [...activeCharacters];
      
      if (response.systemLogs) {
          response.systemLogs.forEach(log => {
              addLog('Sistema', log, 'system-info');
          });
      }

      if (response.resourceChanges) {
        response.resourceChanges.forEach(change => {
          const charIndex = updatedCharacters.findIndex(c => c.name === change.characterName);
          if (charIndex !== -1) {
              const res = change.resource;
              // Permite HP negativo se permadeathEnabled para lógica de morte, senão trava em 0
              let newValue = updatedCharacters[charIndex].derived[res] + change.value;
              if (!permadeathEnabled) newValue = Math.max(0, newValue);
              
              updatedCharacters[charIndex] = { ...updatedCharacters[charIndex], derived: { ...updatedCharacters[charIndex].derived, [res]: newValue } };
              addLog('Sistema', `${change.characterName}: ${res.toUpperCase()} ${change.value > 0 ? '+' : ''}${change.value}`, change.value < 0 ? 'damage' : 'gain');
          } else {
             addLog('Sistema', `${change.characterName}: ${change.resource.toUpperCase()} ${change.value > 0 ? '+' : ''}${change.value}`, change.value < 0 ? 'damage' : 'gain');
          }
        });
      }

      if (response.inventoryUpdates) {
        response.inventoryUpdates.forEach(update => {
          const charIndex = updatedCharacters.findIndex(c => c.name === update.characterName);
          if (charIndex !== -1) {
              const char = updatedCharacters[charIndex];
              if (update.action === 'ADD') {
                  setNearbyItems(prev => {
                      if (prev.some(i => i.name === update.item.name)) return prev;
                      addLog('Loot', `${update.item.name} caiu no chão/encontrado.`, 'system-info');
                      return [...prev, update.item];
                  });
              } else if (update.action === 'REMOVE') {
                  char.items = char.items.filter(i => i.name !== update.item.name);
                  if (update.cost) {
                      char.wealth = Math.max(0, char.wealth - update.cost);
                      addLog('Comércio', `Gastou ${update.cost}.`, 'system-info');
                  }
                  addLog('Perda', `${char.name} perdeu ${update.item.name}`, 'damage');
              }
          }
        });
      }

      if (response.nearbyItems && response.nearbyItems.length > 0) {
          setNearbyItems(prev => {
              const newItems = response.nearbyItems.filter(newItem => !prev.some(existing => existing.name === newItem.name));
              if (newItems.length > 0) {
                  addLog('Ambiente', `${newItems.length} novos itens no local.`, 'system-info');
                  return [...prev, ...newItems];
              }
              return prev;
          });
      }

      if (response.characterStatusUpdates) {
          response.characterStatusUpdates.forEach(update => {
              const charIndex = updatedCharacters.findIndex(c => c.name === update.characterName);
              if (charIndex !== -1) updatedCharacters[charIndex].status = update.status;
          });
      }
      setActiveCharacters(updatedCharacters);
      
      if (response.activeEnemies) setEnemies(response.activeEnemies.map(e => ({...e, status: e.status || []})));
      if (response.activeAllies) setActiveAllies(response.activeAllies.map(a => ({...a, status: a.status || []})));
      if (response.activeNeutrals) setActiveNeutrals(response.activeNeutrals);
      
      if (response.timeData) setTimeData(response.timeData);

      if (response.mapData) {
          // Se o local mudou, limpamos os itens do chão que ficaram para trás
          if (mapData && response.mapData.locationName !== mapData.locationName) {
              setNearbyItems([]);
              addLog('Ambiente', 'Nova localização alcançada. Itens anteriores deixados para trás.', 'system-info');
          }
          setMapData(response.mapData);
      }
      
      setHistory(prev => [...prev, { role: 'gm', content: response.storyText, timestamp: Date.now() + 100 }]);
      
      const newGameResult = response.isGameOver && response.gameResult ? (response.gameResult === 'VICTORY' ? 'victory' : 'defeat') : null;
      if (newGameResult) setGameResult(newGameResult);

      onStateChange(
        (response.activeEnemies && response.activeEnemies.length > 0) || false,
        newGameResult
      );

    } catch (error) {
      setHistory(prev => [...prev, { role: 'gm', content: "Erro na conexão divina...", timestamp: Date.now() }]);
    } finally { setIsProcessing(false); }
  };

  const getHpPercent = (curr: number, max: number) => Math.min(100, Math.max(0, (curr / max) * 100));

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
      {/* TRADE MODAL */}
      {tradeTarget && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <ShoppingBag className="text-amber-500" />
                          <div>
                              <h3 className="font-cinzel text-xl text-amber-100 font-bold">{tradeTarget.name}</h3>
                              <p className="text-xs text-slate-400 uppercase tracking-widest">Mercador</p>
                          </div>
                      </div>
                      <button onClick={() => setTradeTarget(null)} className="text-slate-500 hover:text-white"><X size={24}/></button>
                  </div>
                  
                  <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                      {/* COMPRAR */}
                      <div className="flex-1 p-4 border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]">
                          <h4 className="text-sm font-bold text-amber-400 uppercase mb-3 flex items-center gap-2 sticky top-0 bg-slate-900/90 py-2 z-10 rounded px-2 backdrop-blur-sm shadow">
                              <ArrowDownToLine size={14}/> Estoque da Loja (Comprar)
                          </h4>
                          {!tradeTarget.shopItems || tradeTarget.shopItems.length === 0 ? (
                              <div className="text-center text-slate-400 italic mt-8">O estoque está vazio...</div>
                          ) : (
                              <div className="grid grid-cols-1 gap-3">
                                  {tradeTarget.shopItems.map((item, idx) => (
                                      <div key={idx} className="bg-slate-900/90 p-3 rounded border border-slate-700 shadow-md flex justify-between items-start gap-2">
                                          <div className="flex-1">
                                              <div className="font-bold text-slate-200">{item.name}</div>
                                              <div className="text-xs text-slate-400 leading-tight mb-2">{item.description}</div>
                                              <div className="text-[10px] uppercase font-bold text-slate-500 bg-slate-950 px-1 rounded inline-block">{item.type}</div>
                                          </div>
                                          <div className="flex flex-col items-end gap-2 w-28">
                                              <div className="font-bold text-amber-500 flex items-center gap-1">
                                                  <Coins size={14} /> {item.price}
                                              </div>
                                              <div className="flex flex-col gap-1 w-full">
                                                  {activeCharacters.map(char => (
                                                      <button 
                                                          key={char.id}
                                                          disabled={char.wealth < (item.price || 99999)}
                                                          onClick={() => handleBuyItem(char.id, item, tradeTarget.id)}
                                                          className="px-2 py-1 bg-amber-700 hover:bg-amber-600 disabled:bg-slate-800 disabled:opacity-50 text-[10px] text-white rounded font-bold transition-colors w-full truncate"
                                                          title={`Comprar para ${char.name} (${char.wealth})`}
                                                      >
                                                          Comprar ({char.name.substring(0,3)})
                                                      </button>
                                                  ))}
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* VENDER */}
                      <div className="flex-1 p-4 overflow-y-auto bg-slate-900/50">
                          <h4 className="text-sm font-bold text-green-400 uppercase mb-3 flex items-center gap-2 sticky top-0 bg-slate-900/90 py-2 z-10 rounded px-2 backdrop-blur-sm shadow">
                              <ArrowUpFromLine size={14}/> Seus Inventários (Vender)
                          </h4>
                           <div className="space-y-4">
                              {activeCharacters.map(char => (
                                  <div key={char.id} className="bg-slate-950 border border-slate-800 rounded p-3">
                                      <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-800">
                                          <span className="text-xs font-bold text-slate-300">{char.name}</span>
                                          <span className="text-xs text-amber-400 font-bold flex items-center gap-1"><Coins size={10}/> {char.wealth}</span>
                                      </div>
                                      {char.items.length === 0 ? <div className="text-[10px] text-slate-600 italic">Mochila vazia.</div> : (
                                          <div className="grid grid-cols-1 gap-2">
                                              {char.items.map((item, idx) => (
                                                  <div key={idx} className="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-800">
                                                      <div className="text-[10px] text-slate-300 font-bold truncate pr-2">{item.name}</div>
                                                      <button 
                                                          onClick={() => handleSellItem(char.id, item, idx)}
                                                          className="flex items-center gap-1 px-2 py-1 bg-green-900/30 hover:bg-green-700 text-green-300 border border-green-800 rounded text-[9px] font-bold transition-colors"
                                                      >
                                                          <DollarSign size={10} /> Vender (+{Math.floor((item.price || 10) / 2)})
                                                      </button>
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              ))}
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col flex-1 bg-slate-900/50 rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative order-2 md:order-1">
        {worldData && (
          <div className="bg-slate-950/90 backdrop-blur-md border-b border-amber-900/30 p-2 flex items-center justify-between gap-4 px-4 shadow-md absolute top-0 left-0 right-0 z-20">
            {/* New Compact Header with Tooltips */}
            <HeaderIcon 
                icon={<Target size={18} />} 
                label="Objetivo Atual" 
                value={worldData.mainObjective} 
                colorClass="text-amber-500" 
                align="left"
            />
            <div className="flex-1"></div>
            <HeaderIcon 
                icon={timeData.phase === 'NIGHT' ? <Moon size={18} /> : <Sun size={18} />} 
                label={`Dia ${timeData.dayCount} - ${timeData.phase}`} 
                value={timeData.description} 
                colorClass={timeData.phase === 'DAY' ? 'text-yellow-400' : 'text-blue-300'} 
                align="right"
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pt-16">
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
          
          {/* GM Input Section */}
          {humanGmEnabled && (
              <div className="mb-3 bg-purple-900/20 border border-purple-500/30 p-2 rounded flex items-center gap-2">
                  <span className="text-purple-400 font-bold uppercase text-[10px] whitespace-nowrap px-2 flex items-center gap-1"><PenTool size={10}/> GM Sugere:</span>
                  <input 
                      type="text" 
                      value={gmSuggestion}
                      onChange={(e) => setGmSuggestion(e.target.value)}
                      placeholder="Ex: 'Um dragão aparece de repente!' (A IA narrará isso)"
                      className="w-full bg-transparent text-sm text-purple-200 placeholder-purple-500/50 outline-none"
                  />
              </div>
          )}

          <div className="grid grid-cols-1 gap-4 mb-4">
            {activeCharacters.map((char) => {
              const isDown = permadeathEnabled && char.derived.hp <= 0;
              return (
                <div key={char.id} className={`bg-slate-900 border border-slate-800 rounded-lg p-1 ${isDown ? 'opacity-60 grayscale' : ''}`}>
                  <div className="flex items-center justify-between px-2 py-1 mb-1">
                    <div className="text-xs font-bold text-blue-400 flex items-center gap-1">
                        <User size={10} /> {char.name} 
                        {isDown && <span className="text-red-500 font-bold uppercase ml-2 animate-pulse">[CAÍDO]</span>}
                    </div>
                    {!isDown && (
                        <div className="relative group/dice">
                        <select value={selectedDice[char.id] || 'D20'} onChange={(e) => setSelectedDice(prev => ({ ...prev, [char.id]: e.target.value as DiceType }))} className="bg-slate-800 text-amber-500 text-[10px] font-bold py-1 px-2 rounded border border-slate-700 outline-none cursor-pointer appearance-none pr-6 hover:border-amber-500 transition-colors">
                            {diceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1 top-1.5 text-amber-500 pointer-events-none" />
                        </div>
                    )}
                  </div>
                  <textarea 
                    value={isDown ? "Inconsciente (Precisa de ajuda!)" : (actions[char.id] || '')} 
                    onChange={(e) => setActions(prev => ({ ...prev, [char.id]: e.target.value }))} 
                    placeholder={isDown ? "" : `O que ${char.name} faz?`} 
                    rows={2} 
                    disabled={isProcessing || isDown} 
                    className={`w-full bg-slate-950/50 rounded p-2 text-sm text-slate-200 focus:bg-slate-900 outline-none resize-none border-none ${isDown ? 'cursor-not-allowed italic text-red-400' : ''}`}
                  />
                </div>
            )})}
          </div>
          <Button onClick={submitTurn} disabled={isProcessing} variant={activeCharacters.filter(c => !permadeathEnabled || c.derived.hp > 0).every(c => (actions[c.id] || '').length > 0) ? 'primary' : 'secondary'} className="w-full">Enviar Turno</Button>
        </div>
      </div>
      <div className="w-full md:w-80 bg-slate-900/50 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col order-1 md:order-2 h-[500px] md:h-auto">
        <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-hide flex-none">
            {['entities', 'map', 'character', 'inventory', 'logs'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 min-w-[50px] py-3 text-xs font-bold uppercase flex items-center justify-center transition-colors ${activeTab === tab ? 'bg-slate-800 text-amber-500' : 'bg-slate-950 text-slate-500'}`}>
                    {tab === 'entities' && <Sword size={14} />}
                    {tab === 'map' && <MapIcon size={14} />}
                    {tab === 'character' && <User size={14} />}
                    {tab === 'inventory' && <Backpack size={14} />}
                    {tab === 'logs' && <ClipboardList size={14} />}
                </button>
            ))}
        </div>
        <div className="p-4 space-y-6 flex-1 overflow-y-auto bg-slate-900/30">
            {activeTab === 'entities' && (
                <div className="space-y-4 animate-fade-in">
                    {/* SEÇÃO DE INIMIGOS */}
                    <div className="space-y-3">
                        <h4 className="text-xs text-red-400 font-bold uppercase mb-1">Inimigos Ativos</h4>
                        {enemies.length === 0 ? <div className="text-center py-4 border border-dashed border-slate-800 rounded text-slate-600 text-xs italic">Nenhum inimigo à vista...</div> : (
                            enemies.map((enemy, idx) => (
                                <div key={idx} className="bg-slate-950 border border-slate-800 rounded p-2 space-y-2 relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-slate-200">{enemy.name}</span>
                                        <span className={`text-[8px] px-1.5 rounded uppercase font-bold text-slate-900 ${enemy.difficulty === 'Boss' ? 'bg-amber-500' : 'bg-slate-400'}`}>{enemy.difficulty}</span>
                                    </div>
                                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700">
                                        <div className={`h-full transition-all duration-500 ${getHpPercent(enemy.currentHp, enemy.maxHp) < 30 ? 'bg-red-500' : 'bg-green-600'}`} style={{ width: `${getHpPercent(enemy.currentHp, enemy.maxHp)}%` }}/>
                                        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-md z-10 leading-none pb-[1px]">
                                            {enemy.currentHp} / {enemy.maxHp} HP
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1 mt-2 min-h-[20px]">
                                        {enemy.status?.map((st, i) => (
                                            <StatusBadge 
                                                key={i} 
                                                status={st} 
                                                onRemove={() => handleRemoveStatus(enemy.id, 'enemy', i)} 
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* SEÇÃO DE NEUTROS */}
                    <div className="space-y-3 pt-4 border-t border-slate-800">
                        <h4 className="text-xs text-yellow-400 font-bold uppercase mb-1 flex items-center gap-1"><User size={10} /> Neutros / Mercadores</h4>
                        {activeNeutrals.length === 0 ? <div className="text-center py-2 text-slate-600 text-[10px] italic">Ninguém neutro por perto.</div> : (
                            activeNeutrals.map((npc, idx) => (
                                <div key={idx} className="bg-slate-900/50 border border-yellow-900/30 rounded p-2 space-y-2 relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-yellow-200">{npc.name}</span>
                                        <span className="text-[8px] bg-yellow-900/50 text-yellow-300 px-1.5 rounded uppercase font-bold">{npc.role}</span>
                                    </div>
                                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden relative">
                                        <div className="h-full bg-yellow-500 transition-all duration-500" style={{ width: `${getHpPercent(npc.currentHp, npc.maxHp)}%` }}/>
                                    </div>
                                    <div className="text-[9px] text-slate-400 italic leading-tight">{npc.description}</div>
                                    
                                    {npc.isMerchant && (
                                        <button 
                                            onClick={() => setTradeTarget(npc)}
                                            disabled={enemies.length > 0}
                                            title={enemies.length > 0 ? "Comércio bloqueado em combate" : "Comerciar"}
                                            className="w-full mt-2 py-1 bg-amber-700/50 hover:bg-amber-600 text-amber-100 border border-amber-600/50 rounded flex items-center justify-center gap-1 text-[10px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-800"
                                        >
                                            <ShoppingBag size={10} /> Comerciar
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* SEÇÃO DE ALIADOS */}
                    <div className="space-y-3 pt-4 border-t border-slate-800">
                        <h4 className="text-xs text-blue-400 font-bold uppercase mb-1 flex items-center gap-1"><Shield size={10} /> Aliados (IA)</h4>
                        {activeAllies.length === 0 ? <div className="text-center py-2 text-slate-600 text-[10px] italic">Sem aliados no momento.</div> : (
                            activeAllies.map((ally, idx) => (
                                <div key={idx} className="bg-slate-900/50 border border-blue-900/30 rounded p-2 space-y-2 relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-blue-200">{ally.name}</span>
                                        <span className="text-[8px] bg-blue-900/50 text-blue-300 px-1.5 rounded uppercase font-bold">Aliado</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${getHpPercent(ally.currentHp, ally.maxHp)}%` }}/>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                         {ally.status?.map((st, i) => <StatusBadge key={i} status={st} />)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
            {activeTab === 'character' && (
                <div className="animate-fade-in space-y-4">
                    <h4 className="text-xs text-blue-400 font-bold uppercase mb-3 flex items-center gap-2"><ShieldCheck size={14}/> Ficha do Grupo</h4>
                    {activeCharacters.map(char => (
                        <div key={char.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                            <h5 className="font-cinzel text-blue-200 text-xs font-bold">{char.name}</h5>
                            
                            {/* Stats Display Grid */}
                            <div className="grid grid-cols-4 gap-1 mb-2 bg-slate-900/50 p-2 rounded">
                                {Object.entries(char.attributes).map(([attr, val]) => (
                                    <div key={attr} className="text-center bg-slate-800/80 rounded p-0.5 border border-slate-700/50">
                                        <div className="text-[7px] text-slate-500 font-bold uppercase">{attr}</div>
                                        <div className="text-xs font-bold text-slate-200 font-mono">{val}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono border-y border-slate-800/30 py-1">
                                <span className={`${char.derived.hp <= 0 && permadeathEnabled ? 'text-slate-600' : 'text-red-400'} flex items-center gap-1`}>
                                    <Heart size={10}/> {char.derived.hp}
                                </span>
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
                            
                            {/* SKILL HUD */}
                            <div className="mt-2 pt-2 border-t border-slate-800/50">
                                <span className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-2"><Star size={8}/> Habilidades</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {char.skills.map((skill, idx) => (
                                        <div key={idx} className="bg-slate-900 p-2 rounded border border-slate-800 flex flex-col group/skill">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-[10px] text-slate-200 truncate pr-1">{skill.name}</span>
                                                <span className={`text-[8px] px-1 rounded ${skill.type === 'active' ? 'bg-red-900/40 text-red-300' : 'bg-blue-900/40 text-blue-300'}`}>{skill.type === 'active' ? 'ATV' : 'PAS'}</span>
                                            </div>
                                            <div className="text-[8px] text-slate-500 leading-tight line-clamp-2 group-hover/skill:line-clamp-none transition-all">{skill.description}</div>
                                            <div className="text-[8px] text-slate-600 font-mono mt-1 text-right">Nv.{skill.level}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {activeTab === 'inventory' && (
                <div className="animate-fade-in space-y-6 flex flex-col h-full">
                    {/* Nearby Items / Ground */}
                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 mb-2 max-h-[180px] overflow-y-auto">
                        <h4 className="text-xs text-amber-500 font-bold uppercase mb-2 flex items-center gap-2 sticky top-0 bg-slate-900/90 py-1 z-10 backdrop-blur-sm">
                            <ArrowDownToLine size={14}/> No Chão / Proximidades
                        </h4>
                        {nearbyItems.length === 0 ? (
                            <div className="text-[10px] text-slate-600 italic text-center py-2">Nada por aqui...</div>
                        ) : (
                            <div className="space-y-1">
                                {nearbyItems.map((item, idx) => (
                                    <div key={idx} className="bg-slate-950 p-2 rounded flex justify-between items-center border border-slate-800">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-300">{item.name}</span>
                                            <span className="text-[8px] text-slate-500">{item.effect}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {activeCharacters.map(char => (
                                                <button 
                                                    key={char.id}
                                                    onClick={(e) => { e.stopPropagation(); handleTakeItem(char.id, item, idx); }}
                                                    disabled={enemies.length > 0 || char.items.length >= getInventoryLimit(char)}
                                                    className="p-1 bg-green-900/30 hover:bg-green-700 text-green-300 rounded border border-green-800 disabled:opacity-30 disabled:cursor-not-allowed"
                                                    title={`Pegar para ${char.name} ${enemies.length > 0 ? '(Bloqueado em Combate)' : char.items.length >= getInventoryLimit(char) ? '(Mochila Cheia)' : ''}`}
                                                >
                                                    <Hand size={10} /> <span className="text-[8px] uppercase font-bold">{char.name.substring(0,3)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-slate-800 my-2"></div>

                    {/* Character Inventories */}
                    <div className="space-y-4 overflow-y-auto flex-1">
                        <h4 className="text-xs text-amber-500 font-bold uppercase mb-1 flex items-center gap-2"><Backpack size={14}/> Inventários & Equipamentos</h4>
                        {activeCharacters.map(char => (
                            <div key={char.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
                                <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                                    <h5 className="font-cinzel text-amber-100 text-[10px] font-bold">{char.name}</h5>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-amber-400 flex items-center gap-1 bg-black/30 px-1.5 rounded"><Coins size={10}/> {char.wealth}</span>
                                        <span className={`text-[10px] font-bold ${char.items.length >= getInventoryLimit(char) ? 'text-red-500' : 'text-slate-500'}`}>{char.items.length}/{getInventoryLimit(char)}</span>
                                    </div>
                                </div>
                                
                                {/* EQUIPMENT SLOTS */}
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    {(['back', 'chest', 'hands'] as EquipmentSlot[]).map(slot => {
                                        const equippedItem = char.equipment?.[slot];
                                        return (
                                            <div key={slot} className="bg-slate-900 p-1.5 rounded border border-slate-700 flex flex-col items-center justify-center text-center relative group/slot">
                                                <span className="text-[8px] text-slate-500 font-bold uppercase mb-1">
                                                    {slot === 'back' && <Backpack size={10} />}
                                                    {slot === 'chest' && <Shirt size={10} />}
                                                    {slot === 'hands' && <Sword size={10} />}
                                                </span>
                                                {equippedItem ? (
                                                    <div className="w-full">
                                                        <div className="text-[9px] font-bold text-amber-500 truncate">{equippedItem.name}</div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleUnequipItem(char.id, slot); }}
                                                            // Permitido em combate
                                                            className="absolute inset-0 bg-red-900/90 text-white opacity-0 group-hover/slot:opacity-100 flex items-center justify-center text-[9px] font-bold transition-opacity disabled:cursor-not-allowed disabled:bg-slate-800 disabled:opacity-50"
                                                        >
                                                            Desequipar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[8px] text-slate-700 italic">Vazio</span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="space-y-1">
                                    {char.items.map((item, i) => (
                                        <div key={i} className="bg-slate-900/50 p-1 rounded text-[9px] flex justify-between items-center group relative">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-bold text-slate-200">{item.name}</span>
                                                    {item.slot && <span className="text-[7px] px-1 bg-slate-700 text-slate-300 rounded uppercase">{item.slot}</span>}
                                                    {item.type === 'consumable' && <span className="text-[7px] px-1 bg-green-900/50 text-green-300 rounded uppercase border border-green-800">Consumível</span>}
                                                </div>
                                                <span className="text-amber-500/70">{item.effect}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                {item.type === 'consumable' && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleUseItem(char.id, item, i); }}
                                                        // Habilitado em combate
                                                        className="p-1 text-slate-500 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                        title="Usar Item"
                                                    >
                                                        <Zap size={10} />
                                                    </button>
                                                )}
                                                {item.slot && !char.equipment?.[item.slot] && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleEquipItem(char.id, item, i); }}
                                                        // Permitido em combate
                                                        className="p-1 text-slate-500 hover:text-blue-400 transition-colors"
                                                        title="Equipar"
                                                    >
                                                        <ShieldCheck size={10} />
                                                    </button>
                                                )}
                                                
                                                {/* Botão de Dar/Trocar */}
                                                <div className="relative">
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setGivingItem(givingItem?.itemIndex === i && givingItem?.charId === char.id ? null : {charId: char.id, itemIndex: i}); 
                                                        }}
                                                        disabled={enemies.length > 0}
                                                        className="p-1 text-slate-500 hover:text-purple-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                        title={enemies.length > 0 ? "Troca bloqueada em combate" : "Dar para outro jogador"}
                                                    >
                                                        <Gift size={10} />
                                                    </button>
                                                    {/* Menu de seleção de jogador para troca */}
                                                    {givingItem?.charId === char.id && givingItem?.itemIndex === i && (
                                                        <div className="absolute right-0 bottom-full mb-1 bg-slate-900 border border-slate-700 rounded shadow-xl z-20 w-32 overflow-hidden flex flex-col">
                                                            <div className="text-[8px] bg-slate-800 text-slate-400 px-2 py-1 font-bold uppercase">Dar para:</div>
                                                            {activeCharacters.filter(c => c.id !== char.id).length === 0 ? (
                                                                <div className="p-2 text-[8px] text-slate-500 italic">Ninguém próximo.</div>
                                                            ) : (
                                                                activeCharacters.filter(c => c.id !== char.id).map(target => (
                                                                    <button
                                                                        key={target.id}
                                                                        onClick={(e) => { e.stopPropagation(); handleGiveItem(char.id, target.id, i); }}
                                                                        className="text-left px-2 py-1.5 text-[9px] text-slate-300 hover:bg-purple-900/50 hover:text-white transition-colors border-b border-slate-800 last:border-0"
                                                                    >
                                                                        {target.name}
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDropItem(char.id, item, i); }}
                                                    disabled={enemies.length > 0}
                                                    className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title={enemies.length > 0 ? "Bloqueado em Combate" : "Jogar no Chão"}
                                                >
                                                    <ArrowUpFromLine size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {char.items.length === 0 && <span className="text-[9px] text-slate-700 italic">Mochila vazia...</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {activeTab === 'map' && mapData && (
                <div className="animate-fade-in flex flex-col h-full space-y-4">
                    <h4 className="text-xs text-amber-700 font-bold uppercase mb-3 flex items-center gap-2"><Compass size={12} /> Cartografia</h4>
                    <div className="bg-[#e6d5b8] border-2 border-[#8b5a2b] rounded p-2 text-center shadow-md">
                        <h5 className="font-cinzel text-[#5c4033] text-xs font-bold truncate tracking-wider">{mapData.locationName}</h5>
                    </div>
                    
                    {/* Old Map Style Container */}
                    <div className="relative aspect-square w-full bg-[#e6d5b8] rounded-lg shadow-2xl p-4 overflow-hidden border-4 border-[#8b5a2b]">
                         {/* Texture overlay via CSS gradient/filter simulation */}
                        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] mix-blend-multiply"></div>
                        <div className="absolute inset-0 pointer-events-none opacity-10 bg-gradient-to-br from-[#d2b48c] to-[#a0522d]"></div>
                        
                        <div className="grid grid-cols-5 grid-rows-5 gap-0 h-full w-full relative z-10">
                            {mapData.grid?.map((row, rIdx) => (row?.map((cell, cIdx) => (
                                <div key={`${rIdx}-${cIdx}`} className="flex items-center justify-center relative hover:bg-[#dcbfa3]/30 transition-colors group/cell border border-[#8b5a2b]/10">
                                    {cell === '.' ? <div className="text-[#8b5a2b]/20 text-[10px] font-serif">.</div> : <MapPin symbol={cell} label={mapData.legend.find(l => l.symbol === cell)?.description} type={['👹', '👤', '💰'].some(e => cell.includes(e)) ? 'actor' : 'poi'} />}
                                </div>
                            ))))}
                        </div>
                    </div>

                    <div className="bg-[#e6d5b8] p-3 rounded border border-[#8b5a2b] text-[10px] space-y-1 max-h-[150px] overflow-y-auto shadow-inner text-[#4a3b2a]">
                         <h5 className="font-bold text-[#8b5a2b] uppercase text-[9px] border-b border-[#8b5a2b]/30 pb-1 mb-2">Legenda do Mapa</h5>
                         {mapData.legend.map((l, i) => (
                             <div key={i} className="flex gap-2 items-center">
                                 <span className="w-5 text-center font-bold text-lg">{l.symbol}</span>
                                 <span className="font-serif italic">{l.description}</span>
                             </div>
                         ))}
                    </div>
                </div>
            )}
            {activeTab === 'logs' && (
                <div className="h-full flex flex-col animate-fade-in relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2 flex-none bg-slate-900 pb-2 z-10">
                        <h4 className="text-xs text-purple-400 font-bold uppercase flex items-center gap-2"><Dices size={12} /> Log de Batalha</h4>
                        <button onClick={clearLogs} className="text-[10px] text-slate-500 hover:text-red-400 flex items-center gap-1 border border-slate-700 px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 transition-colors">
                            <Trash size={10} /> Limpar
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {mechanicLogs.map((log) => (
                            <div key={log.id} className="bg-slate-950/80 p-2 rounded border border-slate-800 text-[10px] space-y-1">
                                <div className="flex justify-between font-bold">
                                    <span className={log.type === 'player-roll' ? 'text-blue-300' : log.type === 'system-info' ? 'text-slate-400' : 'text-red-300'}>
                                        {log.source}
                                    </span>
                                    <span>{log.value}</span>
                                </div>
                                <div className={`leading-tight ${log.type === 'system-info' && log.content.includes('[SISTEMA]') ? 'text-green-400 font-mono' : 'text-slate-400'}`}>
                                    {log.content}
                                </div>
                            </div>
                        ))}
                        <div ref={logsBottomRef} />
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};