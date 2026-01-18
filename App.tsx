
import React, { useState } from 'react';
import { GamePhase, WorldData, Character, NarrativeTurn, Enemy, MapData, Ally } from './types';
import { WorldSetup } from './components/WorldSetup';
import { CharacterCreation } from './components/CharacterCreation';
import { NarrativeView } from './components/NarrativeView';
import { startNarrative } from './services/geminiService';
import { AudioController, MusicTrack } from './components/AudioController';
import { Scroll, Users, Map, Dices, Skull, UserCog, Hand } from 'lucide-react';

const App: React.FC = () => {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [narrativeHistory, setNarrativeHistory] = useState<NarrativeTurn[]>([]);
  const [initialEnemies, setInitialEnemies] = useState<Enemy[]>([]);
  const [initialAllies, setInitialAllies] = useState<Ally[]>([]);
  const [initialMapData, setInitialMapData] = useState<MapData | undefined>(undefined);
  const [loadingStory, setLoadingStory] = useState(false);
  
  // Settings State
  const [karmicDiceEnabled, setKarmicDiceEnabled] = useState(true);
  const [permadeathEnabled, setPermadeathEnabled] = useState(false);
  const [humanGmEnabled, setHumanGmEnabled] = useState(false);
  const [manualDiceEnabled, setManualDiceEnabled] = useState(false);

  const [musicTrack, setMusicTrack] = useState<MusicTrack>('MENU');

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
      setInitialMapData(result.mapData);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      <AudioController track={musicTrack} />

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-600 p-2 rounded-lg text-white">
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
            karmicDiceEnabled={karmicDiceEnabled}
            permadeathEnabled={permadeathEnabled}
            humanGmEnabled={humanGmEnabled}
            manualDiceEnabled={manualDiceEnabled}
            initialMapData={initialMapData}
            onStateChange={handleNarrativeStateChange}
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
