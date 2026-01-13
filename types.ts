
export enum GamePhase {
  SETUP = 'SETUP',
  CHARACTER_CREATION = 'CHARACTER_CREATION',
  NARRATIVE = 'NARRATIVE',
  GAME_OVER = 'GAME_OVER'
}

export interface WorldData {
  premise: string;
  themes: string[];
  coreConflict: string;
  mainObjective: string;
}

export interface Skill {
  name: string;
  description: string;
  type: 'active' | 'passive';
  level: number; // Nível da habilidade (Inteiro)
}

export interface Attributes {
  FOR: number; // Força
  DES: number; // Destreza
  CON: number; // Constituição
  INT: number; // Inteligência
  SAB: number; // Sabedoria
  CAR: number; // Carisma
  AGI: number; // Agilidade (Novo)
  SOR: number; // Sorte (Novo)
}

export interface DerivedStats {
  hp: number;      // 10 + (CON * 5)
  stamina: number; // 5 + (FOR + AGI) * 2
  mana: number;    // 5 + (INT * 3)
}

export interface Item {
  name: string;
  description: string;
  effect: string; 
}

export interface Character {
  id: string;
  name: string;
  concept: string;
  motivation: string;
  strength: string;
  flaw: string;
  connection?: string;
  skills: Skill[],
  attributes: Attributes;
  derived: DerivedStats;
  items: Item[];
}

export interface Enemy {
  id: string;
  name: string;
  description: string;
  currentHp: number;
  maxHp: number;
  difficulty: 'Minion' | 'Elite' | 'Boss'; // Define a escala de poder e cor da barra
}

export interface NarrativeTurn {
  role: 'gm' | 'player' | 'system';
  content: string;
  timestamp: number;
}

export type DiceType = 'D4' | 'D6' | 'D8' | 'D10' | 'D12' | 'D20' | 'D100';

export interface RollResult {
  type: DiceType;
  value: number;
}

export interface ActionInput {
  characterId: string;
  action: string;
}

export interface AttributeChange {
  characterName: string;
  attribute: keyof Attributes;
  value: number; 
  reason: string;
}

export interface ResourceChange {
  characterName: string;
  resource: 'hp' | 'mana' | 'stamina';
  value: number;
  reason: string;
}

export interface InventoryUpdate {
  characterName: string;
  item: Item;
  action: 'ADD' | 'REMOVE';
}

export interface MapData {
    locationName: string;
    grid: string[][]; // Matriz 5x5 de emojis/strings
    legend: { symbol: string, description: string }[];
}

export interface TurnResponse {
  storyText: string;
  isGameOver: boolean;
  gameResult?: 'VICTORY' | 'DEFEAT';
  attributeChanges: AttributeChange[];
  resourceChanges: ResourceChange[];
  inventoryUpdates: InventoryUpdate[];
  activeEnemies: Enemy[]; // Lista atualizada de inimigos na cena
  mapData?: MapData; // Novo campo opcional para o mapa
}
