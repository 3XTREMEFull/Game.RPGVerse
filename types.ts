
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
  currencyName: string; // Nome da moeda (Ouro, Tampinhas, Créditos, Ração)
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

export type EquipmentSlot = 'back' | 'chest' | 'hands';

export interface Item {
  id?: string; // Unique ID to prevent duplication
  name: string;
  description: string;
  effect: string;
  type?: 'consumable' | 'equipment' | 'misc'; // Classification for UI actions
  slot?: EquipmentSlot; // If defined, it can be equipped
  capacityBonus?: number; // Only for 'back' items (backpacks)
  price?: number; // Preço para comércio
}

export interface StatusEffect {
  name: string;
  description: string;
  duration: number; // turns
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
  equipment: Partial<Record<EquipmentSlot, Item>>; // Equipped items do not count towards inventory limit
  status?: StatusEffect[];
  wealth: number; // Dinheiro atual
}

export interface Enemy {
  id: string;
  name: string;
  description: string;
  currentHp: number;
  maxHp: number;
  currentMana: number;     
  maxMana: number;         
  currentStamina: number;  
  maxStamina: number;      
  difficulty: 'Minion' | 'Elite' | 'Boss'; 
  status?: StatusEffect[];
  skills?: Skill[]; // Habilidades de ataque e passivas dos inimigos
}

export interface Ally {
  id: string;
  name: string;
  description: string;
  currentHp: number;
  maxHp: number;
  currentMana: number;     
  maxMana: number;         
  currentStamina: number;  
  maxStamina: number;      
  status?: StatusEffect[];
}

export interface NeutralNPC {
  id: string;
  name: string;
  description: string;
  role: 'Merchant' | 'Civilian' | 'Animal' | 'Other';
  currentHp: number;
  maxHp: number;
  status?: StatusEffect[];
  isMerchant: boolean;
  shopItems?: Item[]; // Inventário para venda se for mercador
}

export type TimePhase = 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';

export interface TimeData {
  dayCount: number;
  phase: TimePhase;
  description: string; // Ex: "Final de tarde chuvoso", "Madrugada fria"
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
  characterName: string; // Pode ser nome de Personagem ou Inimigo
  resource: 'hp' | 'mana' | 'stamina';
  value: number;
  reason: string;
}

export interface CharacterStatusUpdate {
  characterName: string;
  status: StatusEffect[];
}

export interface InventoryUpdate {
  characterName: string;
  item: Item;
  action: 'ADD' | 'REMOVE';
  cost?: number; // Custo se houve transação
}

export interface MapData {
    locationName: string;
    grid: string[][]; // Matriz 5x5 de emojis/strings
    legend: { symbol: string, description: string }[];
}

export interface TurnResponse {
  storyText: string;
  systemLogs: string[]; // Logs técnicos formatados para o console
  isGameOver: boolean;
  gameResult?: 'VICTORY' | 'DEFEAT';
  attributeChanges: AttributeChange[];
  resourceChanges: ResourceChange[];
  inventoryUpdates: InventoryUpdate[];
  characterStatusUpdates?: CharacterStatusUpdate[];
  activeEnemies: Enemy[]; // Lista atualizada de inimigos na cena
  activeAllies: Ally[];   // Lista de aliados controlados pelo GM
  activeNeutrals: NeutralNPC[]; // Nova lista de NPCs neutros/mercadores
  nearbyItems: Item[];    // Itens encontrados no chão/ambiente
  mapData?: MapData;
  timeData: TimeData; // Atualização do tempo
}