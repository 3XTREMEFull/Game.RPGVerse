
import React, { useState, useEffect } from 'react';
import { GamePhase, WorldData, Character, NarrativeTurn, Enemy, MapData, Ally, TimeData, NeutralNPC } from './types';
import { WorldSetup } from './components/WorldSetup';
import { CharacterCreation } from './components/CharacterCreation';
import { NarrativeView } from './components/NarrativeView';
import { startNarrative } from './services/geminiService';
import { AudioController, MusicTrack } from './components/AudioController';
import { Scroll, Users, Map, Dices, Skull, UserCog, Hand } from 'lucide-react';

const STORAGE_KEY = 'rpgverse_state_v1';

interface SavedState {
  phase: GamePhase;
  worldData: WorldData | null;
  characters: Character[];
  narrativeHistory: NarrativeTurn[];
  initialEnemies: Enemy[];
  initialAllies: Ally[];
  initialNeutrals: NeutralNPC[];
  initialMapData: MapData | undefined;
  initialTimeData: TimeData | undefined;
  karmicDiceEnabled: boolean;
  permadeathEnabled: boolean;
  humanGmEnabled: boolean;
  manualDiceEnabled: boolean;
}

const App: React.FC = () => {
  // Inicialização Lazy do State via LocalStorage
  const loadState = (): SavedState | null => {
      try {
          const saved = localStorage.getItem(STORAGE_KEY);
          return saved ? JSON.parse(saved) : null;
      } catch (e) {
          console.error("Erro ao carregar save:", e);
          return null;
      }
  };

  const savedState = loadState();

  const [phase, setPhase] = useState<GamePhase>(savedState?.phase || GamePhase.SETUP);
  const [worldData, setWorldData] = useState<WorldData | null>(savedState?.worldData || null);
  const [characters, setCharacters] = useState<Character[]>(savedState?.characters || []);
  const [narrativeHistory, setNarrativeHistory] = useState<NarrativeTurn[]>(savedState?.narrativeHistory || []);
  const [initialEnemies, setInitialEnemies] = useState<Enemy[]>(savedState?.initialEnemies || []);
  const [initialAllies, setInitialAllies] = useState<Ally[]>(savedState?.initialAllies || []);
  const [initialNeutrals, setInitialNeutrals] = useState<NeutralNPC[]>(savedState?.initialNeutrals || []);
  const [initialMapData, setInitialMapData] = useState<MapData | undefined>(savedState?.initialMapData);
  const [initialTimeData, setInitialTimeData] = useState<TimeData | undefined>(savedState?.initialTimeData);
  
  const [loadingStory, setLoadingStory] = useState(false);
  
  // Settings State
  const [karmicDiceEnabled, setKarmicDiceEnabled] = useState(savedState?.karmicDiceEnabled ?? true);
  const [permadeathEnabled, setPermadeathEnabled] = useState(savedState?.permadeathEnabled ?? false);
  const [humanGmEnabled, setHumanGmEnabled] = useState(savedState?.humanGmEnabled ?? false);
  const [manualDiceEnabled, setManualDiceEnabled] = useState(savedState?.manualDiceEnabled ?? false);

  const [musicTrack, setMusicTrack] = useState<MusicTrack>('MENU');

  // Efeito para Salvar no LocalStorage sempre que algo relevante mudar
  useEffect(() => {
    const stateToSave: SavedState = {
        phase,
        worldData,
        characters,
        narrativeHistory,
        initialEnemies,
        initialAllies,
        initialNeutrals,
        initialMapData,
        initialTimeData,
        karmicDiceEnabled,
        permadeathEnabled,
        humanGmEnabled,
        manualDiceEnabled
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [phase, worldData, characters, narrativeHistory, initialEnemies, initialAllies, initialNeutrals, initialMapData, initialTimeData, karmicDiceEnabled, permadeathEnabled, humanGmEnabled, manualDiceEnabled]);

  const handleResetGame = () => {
      if (confirm("Deseja voltar à tela inicial? Todo o progresso não salvo será perdido e o jogo será resetado.")) {
          localStorage.removeItem(STORAGE_KEY);
          window.location.reload();
      }
  };

  // Transition: Setup -> Character Creation
  const handleWorldCreated = (data: WorldData) => {
    setWorldData(data);
    setPhase(GamePhase.CHARACTER_CREATION);
  };

  // Transition: Character Creation -> Narrative
  const handleCharactersComplete = async (chars: Character[]) => {
    if (!worldData) return;
    setCharacters(chars);
    setLoadingStory(true);
    
    try {
      const result = await startNarrative(worldData, chars);
      
      setNarrativeHistory([
        { role: 'gm', content: result.storyText, timestamp: Date.now() }
      ]);
      setInitialEnemies(result.activeEnemies || []);
      setInitialAllies(result.activeAllies || []);
      setInitialNeutrals(result.activeNeutrals || []);
      setInitialMapData(result.mapData);
      setInitialTimeData(result.timeData);
      setPhase(GamePhase.NARRATIVE);
      
      // Initial music state for narrative
      if (result.activeEnemies && result.activeEnemies.length > 0) {
        setMusicTrack('COMBAT');
      } else {
        setMusicTrack('EXPLORATION');
      }

    } catch (error) {
      console.error("Failed to start story", error);
      alert("Erro ao iniciar a história. Tente novamente.");
    } finally {
      setLoadingStory(false);
    }
  };

  const handleNarrativeStateChange = (hasEnemies: boolean, gameResult: 'victory' | 'defeat' | null) => {
    if (gameResult === 'victory') {
      setMusicTrack('VICTORY');
    } else if (gameResult === 'defeat') {
      setMusicTrack('DEFEAT');
    } else if (hasEnemies) {
      setMusicTrack('COMBAT');
    } else {
      setMusicTrack('EXPLORATION');
    }
  };

  // Callback chamado pelo NarrativeView para atualizar o estado global e persistir
  const handleGameStateUpdate = (
      newHistory: NarrativeTurn[], 
      newCharacters: Character[], 
      newEnemies: Enemy[], 
      newAllies: Ally[], 
      newNeutrals: NeutralNPC[],
      newMapData: MapData | undefined, 
      newTimeData: TimeData
  ) => {
      setNarrativeHistory(newHistory);
      setCharacters(newCharacters);
      setInitialEnemies(newEnemies);
      setInitialAllies(newAllies);
      setInitialNeutrals(newNeutrals);
      setInitialMapData(newMapData);
      setInitialTimeData(newTimeData);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      <AudioController track={musicTrack} />

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={handleResetGame}
            title="Clique para Voltar ao Início (Resetar Jogo)"
          >
            <div className="bg-amber-600 p-2 rounded-lg text-white shadow-lg shadow-amber-900/50">
              <Scroll size={24} />
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-cinzel text-amber-100 tracking-wider">
              RPGVerse
            </h1>
          </div>
          
          <div className="hidden md:flex items-center gap-4 text-sm font-bold text-slate-500 uppercase tracking-widest">
            {phase === GamePhase.SETUP && (
               <div className="flex gap-2">
                   {manualDiceEnabled ? <Hand size={14} className="text-blue-400" /> : karmicDiceEnabled && <Dices size={14} className="text-purple-400" />}
                   {permadeathEnabled && <Skull size={14} className="text-red-500" />}
                   {humanGmEnabled && <UserCog size={14} className="text-amber-400" />}
               </div>
            )}
            <span className={`flex items-center gap-2 ${phase === GamePhase.SETUP ? 'text-amber-500' : ''}`}>
              <Map size={16} /> Mundo
            </span>
            <span className="h-px w-8 bg-slate-800"></span>
            <span className={`flex items-center gap-2 ${phase === GamePhase.CHARACTER_CREATION ? 'text-amber-500' : ''}`}>
              <Users size={16} /> Grupo
            </span>
            <span className="h-px w-8 bg-slate-800"></span>
            <span className={`flex items-center gap-2 ${phase === GamePhase.NARRATIVE ? 'text-amber-500' : ''}`}>
              <Scroll size={16} /> História
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {phase === GamePhase.SETUP && (
          <WorldSetup 
            onWorldCreated={handleWorldCreated} 
            karmicDice={karmicDiceEnabled}
            setKarmicDice={setKarmicDiceEnabled}
            permadeath={permadeathEnabled}
            setPermadeath={setPermadeathEnabled}
            humanGm={humanGmEnabled}
            setHumanGm={setHumanGmEnabled}
            manualDice={manualDiceEnabled}
            setManualDice={setManualDiceEnabled}
          />
        )}

        {phase === GamePhase.CHARACTER_CREATION && worldData && (
          <div className={loadingStory ? 'opacity-50 pointer-events-none' : ''}>
             <CharacterCreation world={worldData} onComplete={handleCharactersComplete} />
          </div>
        )}

        {loadingStory && phase === GamePhase.CHARACTER_CREATION && (
          <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-50 backdrop-blur-sm">
             <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-amber-500 mb-4"></div>
             <h2 className="text-xl font-cinzel text-amber-100 animate-pulse">O Mestre está preparando a cena...</h2>
          </div>
        )}

        {phase === GamePhase.NARRATIVE && (
          <NarrativeView 
            characters={characters} 
            initialHistory={narrativeHistory} 
            worldData={worldData || undefined}
            initialEnemies={initialEnemies}
            initialAllies={initialAllies}
            initialNeutrals={initialNeutrals}
            initialTimeData={initialTimeData}
            initialMapData={initialMapData}
            karmicDiceEnabled={karmicDiceEnabled}
            permadeathEnabled={permadeathEnabled}
            humanGmEnabled={humanGmEnabled}
            manualDiceEnabled={manualDiceEnabled}
            onStateChange={handleNarrativeStateChange}
            onGameStateUpdate={handleGameStateUpdate}
          />
        )}
      </main>
      
      {/* Footer */}
      <footer className="p-4 text-center text-slate-600 text-xs border-t border-slate-900 bg-slate-950">
        Desenvolvido com Google Gemini
      </footer>
    </div>
  );
};

export default App;