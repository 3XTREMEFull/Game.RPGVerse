
import React, { useState, useEffect } from 'react';
import { WorldData, Character, Skill, Attributes, DerivedStats, Item } from '../types';
import { generateCharacterDetails } from '../services/geminiService';
import { Button } from './Button';
import { UserPlus, Shield, Zap, Heart, Trash2, Stars, CheckCircle, Dna, Activity, Target, Flame, Droplets, Backpack, Coins, Plus, Minus, Shuffle, PenTool } from 'lucide-react';

interface CharacterCreationProps {
  world: WorldData;
  onComplete: (characters: Character[]) => void;
}

export const CharacterCreation: React.FC<CharacterCreationProps> = ({ world, onComplete }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [formData, setFormData] = useState<Partial<Character>>({});
  
  // Creation Mode State
  const [creationMode, setCreationMode] = useState<'auto' | 'manual'>('auto');
  const [pointsPool, setPointsPool] = useState(16); // 24 Total - 8 (Base 1 per stat) = 16 to spend

  // States for Details Generation
  const [generatedSkills, setGeneratedSkills] = useState<Skill[]>([]);
  const [generatedAttributes, setGeneratedAttributes] = useState<Attributes | null>(null);
  const [generatedDerived, setGeneratedDerived] = useState<DerivedStats | null>(null);
  const [generatedItems, setGeneratedItems] = useState<Item[]>([]);
  const [generatedWealth, setGeneratedWealth] = useState<number>(0);
  
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Recalculate derived stats locally (Client-side logic mirroring server logic)
  const calculateDerived = (attrs: Attributes): DerivedStats => {
      return {
          hp: 10 + (attrs.CON * 5),
          stamina: 5 + (attrs.FOR + attrs.AGI) * 2,
          mana: 5 + (attrs.INT * 3)
      };
  };

  const handleGenerateDetails = async () => {
    if (!formData.concept) {
      setGenError("Defina o conceito primeiro.");
      return;
    }
    
    setIsGenerating(true);
    setGenError(null);
    setGeneratedSkills([]);
    setSelectedSkills([]);
    setGeneratedAttributes(null);
    setGeneratedDerived(null);
    setGeneratedItems([]);
    setGeneratedWealth(0);

    try {
      const rpDetails = {
          motivation: formData.motivation,
          strength: formData.strength,
          flaw: formData.flaw
      };
      
      const details = await generateCharacterDetails(world, formData.concept, rpDetails);
      if (details.skills.length === 0) throw new Error("Falha ao gerar detalhes.");
      
      setGeneratedSkills(details.skills);
      setGeneratedItems(details.startingItems);
      setGeneratedWealth(details.wealth);
      
      if (creationMode === 'auto') {
          // Use AI generated stats
          setGeneratedAttributes(details.attributes);
          setGeneratedDerived(details.derived);
      } else {
          // Manual Mode: Reset to base stats (1 all)
          const baseAttrs: Attributes = {
              FOR: 1, DES: 1, CON: 1, INT: 1, SAB: 1, CAR: 1, AGI: 1, SOR: 1
          };
          setGeneratedAttributes(baseAttrs);
          setPointsPool(16); // Reset pool
          setGeneratedDerived(calculateDerived(baseAttrs));
      }

      // Auto-select first 2 skills for convenience, but allow change
      setSelectedSkills(details.skills.slice(0, 2));
    } catch (err) {
      setGenError("Erro ao criar detalhes. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateManualAttribute = (attr: keyof Attributes, change: number) => {
      if (!generatedAttributes) return;
      const currentVal = generatedAttributes[attr];
      const newVal = currentVal + change;

      // Bounds check: Min 1, Max 5
      if (newVal < 1 || newVal > 5) return;
      
      // Points check
      if (change > 0 && pointsPool <= 0) return;

      const newAttrs = { ...generatedAttributes, [attr]: newVal };
      setGeneratedAttributes(newAttrs);
      setPointsPool(prev => prev - change);
      setGeneratedDerived(calculateDerived(newAttrs));
  };

  const toggleSkillSelection = (skill: Skill) => {
    if (selectedSkills.some(s => s.name === skill.name)) {
      setSelectedSkills(selectedSkills.filter(s => s.name !== skill.name));
    } else {
      if (selectedSkills.length >= 2) return; // Limit to 2 skills
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const addCharacter = () => {
    if (!formData.name || !formData.concept || !formData.motivation || !generatedAttributes || !generatedDerived) return;
    
    // Prevent adding if points not spent in manual mode (optional, but good for balance)
    // For now, we allow it, maybe they want a weaker character.

    const newChar: Character = {
      id: crypto.randomUUID(),
      name: formData.name,
      concept: formData.concept,
      motivation: formData.motivation,
      strength: formData.strength || "Indefinida",
      flaw: formData.flaw || "Indefinida",
      connection: formData.connection || "",
      skills: selectedSkills,
      attributes: generatedAttributes,
      derived: generatedDerived,
      items: generatedItems,
      equipment: {}, // Initialize equipment
      wealth: generatedWealth
    };

    setCharacters([...characters, newChar]);
    setFormData({});
    setGeneratedSkills([]);
    setSelectedSkills([]);
    setGeneratedAttributes(null);
    setGeneratedDerived(null);
    setGeneratedItems([]);
    setGeneratedWealth(0);
    setPointsPool(16);
  };

  const removeCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
  };

  const AttributeDisplay = ({ label, attrKey, value }: { label: string, attrKey: keyof Attributes, value: number }) => (
    <div className={`flex flex-col items-center p-2 bg-slate-900 rounded border ${creationMode === 'manual' ? 'border-blue-900/50' : 'border-slate-700'} relative overflow-hidden group`}>
      {creationMode === 'auto' && (
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      )}
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</span>
      
      <div className="flex items-center gap-2">
          {creationMode === 'manual' && (
              <button 
                onClick={() => updateManualAttribute(attrKey, -1)}
                disabled={value <= 1}
                className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                  <Minus size={10} />
              </button>
          )}
          
          <span className={`text-xl font-bold font-cinzel w-6 text-center ${value >= 4 ? 'text-amber-400' : 'text-slate-200'}`}>{value}</span>
          
          {creationMode === 'manual' && (
              <button 
                onClick={() => updateManualAttribute(attrKey, 1)}
                disabled={value >= 5 || pointsPool <= 0}
                className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-green-900/50 text-slate-400 hover:text-green-400 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                  <Plus size={10} />
              </button>
          )}
      </div>

      <span className="text-[9px] text-slate-600 font-mono mt-1">Mod: {value - 2 >= 0 ? '+' : ''}{value - 2}</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* World Context Header */}
      <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl space-y-4 shadow-xl">
        <h2 className="text-xl font-bold text-amber-500 font-cinzel">Premissa do Mundo</h2>
        <p className="text-slate-300 italic">"{world.premise}"</p>
        
        <div className="flex items-start gap-3 bg-amber-900/20 p-4 rounded-lg border border-amber-900/50">
           <Target className="text-amber-500 shrink-0 mt-1" />
           <div>
             <h3 className="font-bold text-amber-500 uppercase text-xs tracking-wider mb-1">Objetivo Final</h3>
             <p className="text-amber-100 font-bold">{world.mainObjective}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Column (Left) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UserPlus size={20} className="text-amber-500" />
              Criar Personagem
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Nome</label>
                  <input 
                    name="name" 
                    value={formData.name || ''} 
                    onChange={handleInputChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none"
                    placeholder="Ex: Alaric"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Conceito (Arquétipo)</label>
                  <input 
                    name="concept" 
                    value={formData.concept || ''} 
                    onChange={handleInputChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none"
                    placeholder="Ex: Mago de Fogo, Ladino..."
                  />
                </div>
              </div>

              {/* RP Traits - Moved UP for Generation Context */}
              <div>
                <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Motivação Principal</label>
                <textarea 
                  name="motivation" 
                  value={formData.motivation || ''} 
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none resize-none"
                  placeholder="O que seu personagem mais deseja?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Força (Roleplay)</label>
                  <input 
                    name="strength" 
                    value={formData.strength || ''} 
                    onChange={handleInputChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none"
                    placeholder="Ex: Destemido, Honrado..."
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Fraqueza (Roleplay)</label>
                  <input 
                    name="flaw" 
                    value={formData.flaw || ''} 
                    onChange={handleInputChange}
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-amber-500 outline-none"
                    placeholder="Ex: Impulsivo, Ganancioso..."
                  />
                </div>
              </div>

              {/* Stats Generator Section */}
              <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 space-y-4">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <label className="block text-xs uppercase tracking-wider text-amber-500 font-bold flex items-center gap-2">
                            <Dna size={14} /> Atributos, Recursos & Itens
                        </label>
                    </div>

                    {/* Creation Mode Toggle */}
                    {!generatedAttributes && (
                        <div className="flex bg-slate-900 p-1 rounded border border-slate-800">
                            <button 
                                type="button"
                                onClick={() => setCreationMode('auto')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all ${creationMode === 'auto' ? 'bg-slate-800 text-amber-500 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Shuffle size={14} /> Automático (IA)
                            </button>
                            <button 
                                type="button"
                                onClick={() => setCreationMode('manual')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-all ${creationMode === 'manual' ? 'bg-slate-800 text-blue-400 shadow' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <PenTool size={14} /> Manual (Pontos)
                            </button>
                        </div>
                    )}
                </div>
                
                {generatedAttributes === null && (
                   <div className="text-center py-4">
                    <p className="text-sm text-slate-400 mb-3">
                        {creationMode === 'auto' 
                            ? "A IA definirá atributos, skills e itens baseados no seu Conceito, Força e Fraqueza." 
                            : "A IA gerará itens e skills, mas você distribuirá os atributos."}
                    </p>
                    {genError && <p className="text-red-400 text-xs mb-2">{genError}</p>}
                    <Button 
                      onClick={handleGenerateDetails} 
                      isLoading={isGenerating} 
                      disabled={!formData.concept}
                      variant="secondary"
                      className="w-full text-sm"
                      type="button"
                    >
                      <Activity size={16} /> Inicializar Personagem
                    </Button>
                  </div>
                )}

                {generatedAttributes && generatedDerived && (
                  <div className="space-y-4">
                    {creationMode === 'manual' && (
                        <div className="flex justify-between items-center bg-blue-900/20 px-3 py-2 rounded border border-blue-900/40">
                            <span className="text-xs font-bold text-blue-200 uppercase">Pontos Disponíveis</span>
                            <span className={`text-lg font-bold font-mono ${pointsPool > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{pointsPool}</span>
                        </div>
                    )}

                    {/* Main Attributes */}
                    <div className="grid grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2">
                      <AttributeDisplay label="FOR" attrKey="FOR" value={generatedAttributes.FOR} />
                      <AttributeDisplay label="DES" attrKey="DES" value={generatedAttributes.DES} />
                      <AttributeDisplay label="CON" attrKey="CON" value={generatedAttributes.CON} />
                      <AttributeDisplay label="INT" attrKey="INT" value={generatedAttributes.INT} />
                      <AttributeDisplay label="SAB" attrKey="SAB" value={generatedAttributes.SAB} />
                      <AttributeDisplay label="CAR" attrKey="CAR" value={generatedAttributes.CAR} />
                      <AttributeDisplay label="AGI" attrKey="AGI" value={generatedAttributes.AGI} />
                      <AttributeDisplay label="SOR" attrKey="SOR" value={generatedAttributes.SOR} />
                    </div>
                    
                    {/* Derived Stats & Wealth */}
                    <div className="grid grid-cols-4 gap-4 bg-slate-900/80 p-3 rounded border border-slate-700">
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-red-400 font-bold flex items-center gap-1"><Heart size={12}/> VIDA</span>
                            <span className="text-lg font-cinzel text-white">{generatedDerived.hp}</span>
                        </div>
                        <div className="flex flex-col items-center border-l border-slate-700">
                            <span className="text-xs text-blue-400 font-bold flex items-center gap-1"><Droplets size={12}/> MANA</span>
                            <span className="text-lg font-cinzel text-white">{generatedDerived.mana}</span>
                        </div>
                        <div className="flex flex-col items-center border-l border-slate-700">
                            <span className="text-xs text-green-400 font-bold flex items-center gap-1"><Flame size={12}/> ESTAMINA</span>
                            <span className="text-lg font-cinzel text-white">{generatedDerived.stamina}</span>
                        </div>
                        <div className="flex flex-col items-center border-l border-slate-700">
                            <span className="text-xs text-amber-400 font-bold flex items-center gap-1"><Coins size={12}/> $</span>
                            <span className="text-lg font-cinzel text-white">{generatedWealth}</span>
                        </div>
                    </div>

                    {/* Generated Items */}
                    {generatedItems.length > 0 && (
                        <div className="bg-slate-900/50 p-2 rounded border border-slate-700">
                            <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1 mb-2 uppercase tracking-wider">
                                <Backpack size={10} /> Inventário Inicial Gerado
                            </span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {generatedItems.map((item, idx) => (
                                    <div key={idx} className="bg-slate-800 p-2 rounded text-xs border border-slate-700/50">
                                        <div className="font-bold text-slate-200">{item.name}</div>
                                        <div className="text-[9px] text-slate-500 truncate" title={item.effect}>{item.effect}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                  </div>
                )}

                {/* Skills Selection */}
                {generatedSkills.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-800">
                    <label className="text-xs uppercase text-amber-500 block mb-2 font-bold">
                        Escolha 2 Habilidades ({selectedSkills.length}/2)
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {generatedSkills.map((skill, idx) => {
                        const isSelected = selectedSkills.some(s => s.name === skill.name);
                        return (
                          <div 
                            key={idx}
                            onClick={() => toggleSkillSelection(skill)}
                            className={`p-2 rounded cursor-pointer border transition-all ${
                              isSelected 
                                ? 'bg-amber-900/30 border-amber-500 text-amber-100' 
                                : 'bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-300'
                            } ${!isSelected && selectedSkills.length >= 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-sm">{skill.name} <span className="text-xs bg-slate-950 px-1 rounded text-amber-500">Nv.{skill.level}</span></span>
                              {isSelected && <CheckCircle size={14} className="text-amber-500" />}
                            </div>
                            <p className="text-xs opacity-80 leading-tight">{skill.description}</p>
                          </div>
                        );
                      })}
                    </div>
                    <button 
                      onClick={() => { 
                          setGeneratedSkills([]); 
                          setSelectedSkills([]); 
                          setGeneratedAttributes(null);
                          setGeneratedDerived(null); 
                          setGeneratedItems([]);
                          setGeneratedWealth(0);
                          setPointsPool(16);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-300 underline w-full text-center"
                    >
                      Reiniciar Distribuição
                    </button>
                  </div>
                )}
              </div>

              <Button 
                onClick={addCharacter}
                disabled={!formData.name || !formData.concept || !formData.motivation || selectedSkills.length !== 2 || !generatedAttributes}
                className="w-full mt-4"
                variant="primary"
              >
                Adicionar ao Grupo
              </Button>
            </div>
          </div>
        </div>

        {/* List Column (Right) */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-lg font-bold mb-4">Grupo Reunido ({characters.length})</h3>
          
          {characters.length === 0 && (
            <div className="text-slate-500 italic border-2 border-dashed border-slate-800 rounded-xl p-8 text-center">
              Nenhum aventureiro se apresentou ainda.
            </div>
          )}

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {characters.map((char) => (
              <div key={char.id} className="bg-slate-800 p-4 rounded-lg border-l-4 border-amber-500 relative group shadow-lg">
                <button 
                  onClick={() => removeCharacter(char.id)}
                  className="absolute top-2 right-2 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={16} />
                </button>
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-bold text-amber-100 text-lg">{char.name}</h4>
                        <p className="text-xs text-amber-500/80 uppercase tracking-wide mb-3">{char.concept}</p>
                    </div>
                    <div className="bg-black/30 px-2 py-1 rounded text-amber-400 font-bold text-xs flex items-center gap-1 border border-amber-900/50">
                        <Coins size={12} /> {char.wealth}
                    </div>
                </div>
                
                <div className="grid grid-cols-4 gap-1 mb-3 bg-slate-900/50 p-2 rounded">
                    {Object.entries(char.attributes).map(([key, val]) => (
                        <div key={key} className="text-center">
                            <span className="text-[8px] text-slate-500 block font-bold">{key}</span>
                            <span className="text-sm text-slate-200 font-cinzel">{val}</span>
                        </div>
                    ))}
                </div>

                <div className="flex gap-4 text-xs font-mono text-slate-400 mb-3 bg-slate-950 p-1 rounded justify-center">
                   <span className="text-red-400">HP {char.derived.hp}</span>
                   <span className="text-blue-400">MP {char.derived.mana}</span>
                   <span className="text-green-400">ST {char.derived.stamina}</span>
                </div>

                {/* Character List Inventory Preview */}
                <div className="mb-3 px-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Mochila</span>
                    <div className="flex flex-wrap gap-1">
                        {char.items.map((item, idx) => (
                            <span key={idx} className="text-[10px] bg-slate-700/50 px-2 py-0.5 rounded text-amber-100 border border-slate-600">
                                {item.name}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="space-y-2 mb-3 border-t border-slate-700/50 pt-2">
                    {char.skills.map((s, i) => (
                        <div key={i} className="bg-slate-900/50 p-2 rounded flex gap-2 items-start border border-slate-700/50">
                            <Stars size={12} className="text-purple-400 mt-1 shrink-0" />
                            <div>
                                <span className="text-sm font-bold text-purple-200 block">{s.name} (Nv. {s.level})</span>
                                <span className="text-xs text-slate-400 leading-tight block">{s.description}</span>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          {characters.length > 0 && (
            <Button onClick={() => onComplete(characters)} className="w-full py-4 text-lg shadow-amber-900/50 shadow-xl mt-6">
              Iniciar Aventura
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
