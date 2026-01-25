
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { WorldData, Character, NarrativeTurn, Skill, Attributes, RollResult, TurnResponse, DerivedStats, ResourceChange, Item, Enemy, MapData, StatusEffect, CharacterStatusUpdate, Ally, TimeData, NeutralNPC } from "../types";

// Helper function to safely get the API Key in various environments (Vite, Next.js, Node, etc.)
const getApiKey = (): string => {
  // 1. Try standard Node/Process env (common in local dev or specific builds)
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }

  // 2. Try Vite environment (Standard for React on Vercel)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
    // @ts-ignore
    if (import.meta.env.API_KEY) return import.meta.env.API_KEY;
  }

  return '';
};

const API_KEY = getApiKey();

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Função para limpar JSON formatado com Markdown (```json ... ```)
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  // Remove marcadores de código markdown no início e fim
  return text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
};

// Função helper para tentar reconectar automaticamente em caso de falha
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      if (!API_KEY) throw new Error("API Key is missing. Please check your Vercel Environment Variables (Should be VITE_API_KEY).");
      return await fn();
    } catch (error: any) {
      const errorMessage = error?.message || JSON.stringify(error);
      
      // Se o erro for falta de chave, não adianta tentar de novo
      if (errorMessage.includes("API Key is missing")) throw error;

      // Se for erro de parse JSON, tenta de novo pois a IA pode ter alucinado o formato
      const isJsonError = errorMessage.includes('JSON') || errorMessage.includes('SyntaxError');
      
      const isQuotaError = errorMessage.includes('429') || 
                           errorMessage.includes('quota') || 
                           errorMessage.includes('resource exhausted') || 
                           errorMessage.includes('Too Many Requests') ||
                           errorMessage.includes('user has exceeded quota');

      const shouldRetry = isQuotaError || isJsonError || attempt < maxRetries;

      if (shouldRetry) {
        attempt++;
        const waitTime = isQuotaError ? 5000 : delay; // Espera menos para erros genéricos, 5s para quota
        console.warn(`[Gemini Service] Erro detectado (Tentativa ${attempt}). Tipo: ${isJsonError ? 'JSON_PARSE' : isQuotaError ? 'QUOTA/429' : 'GENÉRICO'}. Aguardando ${waitTime}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        if (!isQuotaError) delay = Math.min(delay * 1.5, 10000); // Backoff menos agressivo
      } else {
        console.error("Máximo de tentativas excedido.", error);
        throw error;
      }
    }
  }
}

const SYSTEM_INSTRUCTION = `
Você é o Mestre de Jogo (GM) para um RPG textual colaborativo.

Seu papel é:
1. Definir o cenário, temas e a MOEDA DO MUNDO.
2. Gerenciar a história, o OBJETIVO FINAL e o TEMPO (Ciclo Dia/Noite).
3. Adjudicar ações usando o SISTEMA DE REGRAS ESPECÍFICO abaixo.
4. Responda SEMPRE em Português do Brasil (pt-BR).

=== DIRETRIZES DE NARRATIVA E TEMPO ===
- **CICLO DIA/NOITE**: Você DEVE manter a continuidade do tempo. Se a cena anterior foi à tarde e eles viajaram, agora pode ser noite. Retorne sempre o objeto 'timeData'.
- **ESTILO LITERÁRIO**: Não seja breve. Escreva descrições ricas, atmosféricas e detalhadas.
- **RITMO VARIADO**: Não force combate a todo turno. Permita cenas de exploração e comércio.
- **ROLEPLAY PROFUNDO**: Considere sempre a FORÇA (Strength) e a FRAQUEZA (Flaw) dos personagens nas narrações. Personagens impulsivos devem ser tentados a agir impulsivamente; personagens fortes devem ter momentos para exibir essa força.

=== REGRAS CRÍTICAS DE MECÂNICA (LEIA ATENTAMENTE) ===

1. **HP E DANO (OBRIGATÓRIO)**: 
   - Se a narrativa descreve um ataque de inimigo acertando um jogador, ou um jogador acertando um inimigo, VOCÊ DEVE GERAR UM OBJETO EM 'resourceChanges' com valor NEGATIVO.
   - Exemplo: Inimigo acerta Jogador -> resourceChange: { characterName: "Jogador", resource: "hp", value: -5 }.
   - **SE NÃO HOUVER 'resourceChanges' PARA DANO, O JOGO QUEBRA.**

2. **LOOT E ITENS (OBRIGATÓRIO)**:
   - Se a narrativa descreve um item caindo, sendo encontrado, ou num baú, VOCÊ DEVE GERAR UM OBJETO EM 'nearbyItems'.
   - Se não preencher 'nearbyItems', o jogador não vê o item.

3. **PASSIVAS E SKILLS**:
   - ANTES de narrar, LEIA todas as Skills (Ativas e Passivas) dos Personagens e Inimigos fornecidas no contexto.
   - Se uma passiva é relevante (ex: "Fúria", "Furtividade", "Pele de Ferro"), APLIQUE-A na resolução da cena.
   - Se o jogador invoca uma skill de ataque pelo nome, use os efeitos dela.

=== SISTEMA DE REGRAS (IMUTÁVEL) ===
ATRIBUTOS (Escala 1-10): FOR, DES, CON, INT, SAB, CAR, AGI, SOR. Modificador = Atributo - 2.

**IMPORTANTE: SLOT 'MÃOS' (hands)**:
  - Se o jogador atacar com item equipado, aplique bônus mecânicos automaticamente.

**HABILIDADES E PASSIVAS**:
- Você deve ler as 'SKILLS' fornecidas no contexto da ação.
- Se uma habilidade dá bônus (ex: "Dobrar bônus de FOR", "Furtividade"), APLIQUE-O na narração e no resultado.
- Passivas devem ser verificadas automaticamente.

COMBATE, INIMIGOS, ALIADOS E NEUTROS:
- Inimigos (Vermelho): Hostis. Devem ter SKILLS de ataque e passivas.
- Aliados (Azul): Amigos/Pets que lutam.
- **Neutros (Amarelo)**: Mercadores, Animais passivos, Civis. Use a lista 'activeNeutrals'.
  - **MERCADORES**: Se houver um mercador, defina 'isMerchant: true' e preencha 'shopItems' com itens e PREÇOS ('price') adequados à economia do mundo.

RECURSOS & MATEMÁTICA (CRÍTICO):
- **REGRA DE SINAL**: Dano/Custo = NEGATIVO. Cura/Ganho = POSITIVO.

LOOT & ITENS (CRÍTICO):
- **GERAÇÃO DE ITENS**: Se você narrar que um item caiu, foi encontrado, ou está em um baú, você **OBRIGATORIAMENTE** deve adicionar esse item ao array 'nearbyItems' na resposta JSON.
- Se o item for dado diretamente ao jogador, use 'inventoryUpdates'.
**REGRA DE LOOT (SORTE)**: Ao saquear, role 1d20 + SOR ocultamente para definir a qualidade.
- **ECONOMIA**: Os preços devem fazer sentido com a moeda definida no 'WorldData'.


MAPA & NAVEGAÇÃO:
- O mapa é uma grade 5x5 representando a REGIÃO IMEDIATA.
- Use Emojis.
- **O MAPA É OBRIGATÓRIO EM TODOS OS TURNOS**.

1. PRINCÍPIO FUNDAMENTAL: UNIVERSALIDADE DAS REGRAS
• Regra Obrigatória: Todas as regras de dados e mecânicas descritas aplicam-se de forma absolutamente igual a todas as entidades do jogo.

2. SISTEMA DE ROLAGEM AUTOMÁTICA E SEPARAÇÃO
• Ação: Você deve executar internamente todas as rolagens necessárias para o jogo.
• Processo: Decisão Interna -> Rolagem -> Log em 'systemLogs' -> Narração em 'storyText'.
• **PROIBIDO NARRAR DADOS**: NUNCA escreva os valores dos dados (ex: "(D20: 15)", "Rolou 12") no 'storyText'. Apenas descreva o resultado da ação (sucesso, falha, impacto).
`;

// MUDANÇA: Alterado para 'gemini-flash-lite-latest' para otimizar velocidade e evitar erro 429 (Too Many Requests).
const MODEL_NAME = "gemini-flash-lite-latest";

export const generateWorldPremise = async (manualInput?: string): Promise<WorldData> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      premise: { type: Type.STRING, description: "A detailed setting description." },
      themes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-5 themes or tonal keywords." },
      coreConflict: { type: Type.STRING, description: "The starting point of the story and main conflict." },
      mainObjective: { type: Type.STRING, description: "The specific final goal players must achieve to win the campaign." },
      currencyName: { type: Type.STRING, description: "Nome da moeda principal (Ex: Peças de Ouro, Créditos Imperiais, Ração, Tampinhas)." }
    },
    required: ["premise", "themes", "coreConflict", "mainObjective", "currencyName"]
  };

  let prompt = "Crie uma premissa de mundo de RPG única, temas, um conflito central, um OBJETIVO FINAL CLARO e defina a MOEDA utilizada. Seja criativo.";
  
  if (manualInput) {
    prompt = `Com base na seguinte ideia do usuário: "${manualInput}", expanda e crie uma premissa detalhada, temas, conflito, OBJETIVO FINAL e defina a MOEDA adequada ao cenário.`;
  }

  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA");
    return JSON.parse(cleanJson(response.text)) as WorldData;
  });
};

export const generateCharacterDetails = async (world: WorldData, characterConcept: string, rpDetails?: { motivation?: string, strength?: string, flaw?: string }): Promise<{ skills: Skill[], attributes: Attributes, derived: DerivedStats, startingItems: Item[], wealth: number }> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      skills: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['active', 'passive'] },
            level: { type: Type.INTEGER }
          },
          required: ['name', 'description', 'type', 'level']
        }
      },
      attributes: {
        type: Type.OBJECT,
        properties: {
          FOR: { type: Type.INTEGER },
          DES: { type: Type.INTEGER },
          CON: { type: Type.INTEGER },
          INT: { type: Type.INTEGER },
          SAB: { type: Type.INTEGER },
          CAR: { type: Type.INTEGER },
          AGI: { type: Type.INTEGER },
          SOR: { type: Type.INTEGER }
        },
        required: ["FOR", "DES", "CON", "INT", "SAB", "CAR", "AGI", "SOR"]
      },
      startingItems: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            effect: { type: Type.STRING, description: "Mechanical bonus (e.g., +2 Attack, +1d4 Damage)." },
            type: { type: Type.STRING, enum: ['consumable', 'equipment', 'misc'] },
            slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'], description: "Slot de equipamento. 'back' = Costas (Mochila, Capa, Manto). 'chest' = Corpo. 'hands' = Mãos." },
            capacityBonus: { type: Type.INTEGER, description: "Bônus de capacidade (Apenas se for Mochila/Backpack). Capas têm 0." }
          },
          required: ["name", "description", "effect", "type"]
        }
      },
      wealth: { type: Type.INTEGER, description: `Quantidade inicial de ${world.currencyName}` }
    },
    required: ["skills", "attributes", "startingItems", "wealth"]
  };

  const prompt = `
  Mundo: ${world.premise}
  Moeda: ${world.currencyName}
  Conceito: ${characterConcept}
  ${rpDetails?.strength ? `PONTO FORTE PRINCIPAL (ROLEPLAY): ${rpDetails.strength}` : ''}
  ${rpDetails?.flaw ? `FRAQUEZA PRINCIPAL (ROLEPLAY): ${rpDetails.flaw}` : ''}
  ${rpDetails?.motivation ? `MOTIVAÇÃO: ${rpDetails.motivation}` : ''}
  
  Tarefa Rápida: Gere os dados mecânicos para este personagem em JSON.
  - **SKILLS TEMÁTICAS**: Crie habilidades que reflitam não apenas o conceito, mas também o Ponto Forte (Ex: Se é 'Corajoso', dê bônus contra medo; se é 'Forte', dê bônus de dano) e a Fraqueza (Ex: Se é 'Impulsivo', uma passiva de alto risco).
  - DESCRIÇÕES CURTAS e diretas (máx 12 palavras).
  - Atributos equilibrados (1-5).
  - 4 Habilidades simples e funcionais.
  - 3 Itens Iniciais (Pelo menos 1 arma/foco em slot='hands').
  - Riqueza inicial compatível.
  `;

  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA");

    const jsonString = cleanJson(response.text);
    const data = JSON.parse(jsonString) as { skills: Skill[], attributes: Attributes, startingItems: Item[], wealth: number };
    
    const derived: DerivedStats = {
      hp: 10 + (data.attributes.CON * 5),
      stamina: 5 + (data.attributes.FOR + data.attributes.AGI) * 2,
      mana: 5 + (data.attributes.INT * 3)
    };

    return { ...data, derived };
  });
};

export const startNarrative = async (world: WorldData, characters: Character[]): Promise<{ storyText: string; activeEnemies: Enemy[]; activeAllies: Ally[]; activeNeutrals: NeutralNPC[]; mapData: MapData; timeData: TimeData }> => {
  const characterDescriptions = characters.map(c => 
    `- ${c.name} (${c.concept}) | Motivação: "${c.motivation}" | Força: "${c.strength}" | Fraqueza: "${c.flaw}"`
  ).join('\n');

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
        storyText: { type: Type.STRING },
        activeEnemies: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    currentHp: { type: Type.INTEGER },
                    maxHp: { type: Type.INTEGER },
                    currentMana: { type: Type.INTEGER },
                    maxMana: { type: Type.INTEGER },
                    currentStamina: { type: Type.INTEGER },
                    maxStamina: { type: Type.INTEGER },
                    difficulty: { type: Type.STRING, enum: ["Minion", "Elite", "Boss"] },
                    skills: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: { 
                                name: { type: Type.STRING }, 
                                description: { type: Type.STRING }, 
                                type: { type: Type.STRING, enum: ['active', 'passive'] },
                                level: { type: Type.INTEGER } 
                            }, 
                            required: ["name", "description", "type", "level"] 
                        } 
                    }
                },
                required: ["id", "name", "description", "currentHp", "maxHp", "currentMana", "maxMana", "currentStamina", "maxStamina", "difficulty"]
            }
        },
        activeAllies: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    currentHp: { type: Type.INTEGER },
                    maxHp: { type: Type.INTEGER },
                    currentMana: { type: Type.INTEGER },
                    maxMana: { type: Type.INTEGER },
                    currentStamina: { type: Type.INTEGER },
                    maxStamina: { type: Type.INTEGER }
                },
                required: ["id", "name", "description", "currentHp", "maxHp", "currentMana", "maxMana", "currentStamina", "maxStamina"]
            }
        },
        activeNeutrals: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    role: { type: Type.STRING, enum: ['Merchant', 'Civilian', 'Animal', 'Other'] },
                    currentHp: { type: Type.INTEGER },
                    maxHp: { type: Type.INTEGER },
                    isMerchant: { type: Type.BOOLEAN },
                    shopItems: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                description: { type: Type.STRING },
                                effect: { type: Type.STRING },
                                type: { type: Type.STRING, enum: ['consumable', 'equipment', 'misc'] },
                                slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'], description: "Slot. 'back' = Costas (Mochila, Capa, Manto)." },
                                price: { type: Type.INTEGER },
                                capacityBonus: { type: Type.INTEGER, description: "Bônus de capacidade (Apenas Mochilas)." }
                            },
                            required: ["name", "description", "effect", "type", "price"]
                        }
                    }
                },
                required: ["id", "name", "description", "role", "currentHp", "maxHp", "isMerchant"]
            }
        },
        mapData: {
            type: Type.OBJECT,
            properties: {
                locationName: { type: Type.STRING },
                grid: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                legend: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["symbol", "description"] } }
            },
            required: ["locationName", "grid", "legend"]
        },
        timeData: {
            type: Type.OBJECT,
            properties: {
                dayCount: { type: Type.INTEGER },
                phase: { type: Type.STRING, enum: ['DAWN', 'DAY', 'DUSK', 'NIGHT'] },
                description: { type: Type.STRING }
            },
            required: ["dayCount", "phase", "description"]
        }
    },
    required: ["storyText", "activeEnemies", "activeAllies", "activeNeutrals", "mapData", "timeData"]
  };

  const prompt = `
  PERSONAGENS:
  ${characterDescriptions}

  Mundo: ${world.premise}
  Moeda: ${world.currencyName}

  Escreva a introdução. Defina o Horário Inicial (timeData).
  **IMPORTANTE**: Ao narrar, destaque como as Fraquezas (Flaws) ou Forças (Strengths) dos personagens influenciam sua situação inicial.
  **REGRA DA PRIMEIRA CENA**: A lista 'activeEnemies' DEVE SER VAZIA []. Não gere inimigos agora.
  **NEUTROS**: Gere NPCs neutros/mercadores se fizer sentido para a cena (Ex: uma praça de mercado).
  **MAPA**: Gere um 'mapData' 5x5 completo e válido.
  `;

  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA");
    return JSON.parse(cleanJson(response.text)) as { storyText: string; activeEnemies: Enemy[]; activeAllies: Ally[]; activeNeutrals: NeutralNPC[]; mapData: MapData; timeData: TimeData };
  });
};

export const processTurn = async (
  history: NarrativeTurn[], 
  playerActions: { name: string; action: string }[],
  characters: Character[],
  rolls: Record<string, RollResult>,
  world: WorldData,
  currentEnemies: Enemy[],
  currentAllies: Ally[] = [],
  currentNeutrals: NeutralNPC[] = [],
  currentTime?: TimeData,
  permadeathEnabled: boolean = false,
  humanGmSuggestion?: string
): Promise<TurnResponse> => {
  // OTIMIZAÇÃO: Contexto abreviado para reduzir tokens
  const context = history.map(h => {
      if (h.role === 'system') return `[SIS]: ${h.content}`;
      return `${h.role === 'gm' ? 'GM' : 'PCS'}: ${h.content}`;
  }).join('\n');
  
  // Construct Character Passive/Active Skill Context explicitly
  const characterSkillsContext = characters.map(c => {
      const activeSkills = c.skills.filter(s => s.type === 'active').map(s => `- [A] ${s.name}: ${s.description}`).join('\n');
      const passiveSkills = c.skills.filter(s => s.type === 'passive').map(s => `- [P] ${s.name}: ${s.description}`).join('\n');
      return `PC: ${c.name}
      TRAÇOS: Força="${c.strength}", Fraqueza="${c.flaw}"
      ${activeSkills}
      ${passiveSkills}`;
  }).join('\n\n');

  // Construct Enemy Skill Context explicitly
  const enemySkillsContext = currentEnemies.map(e => {
      const skills = e.skills && e.skills.length > 0 
        ? e.skills.map(s => `- [${s.type.toUpperCase()}] ${s.name}: ${s.description}`).join('\n')
        : "- Ataque Básico";
      return `INIMIGO: ${e.name}\n${skills}`;
  }).join('\n\n');

  const actionContext = playerActions.map(p => {
    const char = characters.find(c => c.name === p.name);
    const roll = rolls[char?.id || ''];
    // Se o personagem estiver inconsciente (HP <= 0 e permadeath on), a ação vem vazia ou marcada
    if (!p.action || p.action === "MORTO") {
        return `PC ${p.name}: MORTO.`;
    }

    if (!char || !roll) return `Ação: ${p.action}`;
    
    const stats = JSON.stringify(char.attributes);
    
    const handsItem = char.equipment?.hands;
    const handsInfo = handsItem 
        ? `[ITEM EQUIPADO: "${handsItem.name}". EFEITO: "${handsItem.effect}"]` 
        : "[MÃOS VAZIAS]";
    
    return `PC: ${p.name}\n- AÇÃO: "${p.action}"\n- DADO: ${roll.type}(${roll.value})\n- ${handsInfo}\n- ATRIBUTOS: ${stats}\n- $: ${char.wealth}`;
  }).join('\n\n');

  const enemyContext = currentEnemies.length > 0 
    ? `INIMIGOS: ${currentEnemies.map(e => `- ${e.name} (${e.difficulty}, HP:${e.currentHp})`).join('\n')}`
    : "SEM INIMIGOS.";

  const neutralContext = currentNeutrals.length > 0
    ? `NEUTROS: ${currentNeutrals.map(n => `- ${n.name} (${n.role}, Merc:${n.isMerchant})`).join('\n')}`
    : "SEM NEUTROS.";

  const timeContext = currentTime 
    ? `TEMPO: Dia ${currentTime.dayCount}, ${currentTime.phase} (${currentTime.description}).`
    : "TEMPO: Inicio.";

  let extraInstructions = "";
  if (permadeathEnabled) {
      extraInstructions += `\n**MODO MORTE PERMANENTE HABILITADO**:
      - Personagens com HP > 1 que sofrem dano letal ficam com 1 HP (Sobrevivência/Último Suspiro).
      - Personagens que JÁ estão com 1 HP e sofrem dano MORREM instantaneamente (HP 0).
      - Não existe estado "Inconsciente/Caído". Ou está de pé (HP > 0) ou Morto (HP 0).
      - Narre o evento dramaticamente (Ex: "O golpe seria fatal, mas ele resiste por pura vontade com 1 HP!" ou "O golpe final ceifa sua vida").
      - Se TODOS os jogadores estiverem mortos, defina 'isGameOver: true' e 'gameResult: DEFEAT'.
      `;
  }

  if (humanGmSuggestion) {
      extraInstructions += `\n**SUGESTÃO DO GM HUMANO (PRIORIDADE)**: O GM humano instruiu: "${humanGmSuggestion}". Você DEVE incorporar essa sugestão na narrativa da próxima cena, criando os inimigos, eventos ou itens que o GM solicitou, mas mantendo as regras de dados e atributos.`;
  }

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      storyText: { type: Type.STRING },
      systemLogs: { type: Type.ARRAY, items: { type: Type.STRING } },
      isGameOver: { type: Type.BOOLEAN },
      gameResult: { type: Type.STRING, enum: ["VICTORY", "DEFEAT", "ONGOING"] },
      attributeChanges: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            characterName: { type: Type.STRING }, 
            attribute: { type: Type.STRING }, 
            value: { type: Type.INTEGER }, 
            reason: { type: Type.STRING } 
          }, 
          required: ["characterName", "attribute", "value", "reason"] 
        } 
      },
      resourceChanges: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            characterName: { type: Type.STRING }, 
            resource: { type: Type.STRING }, 
            value: { type: Type.INTEGER }, 
            reason: { type: Type.STRING } 
          }, 
          required: ["characterName", "resource", "value", "reason"] 
        } 
      },
      characterStatusUpdates: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            characterName: { type: Type.STRING }, 
            status: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  name: { type: Type.STRING }, 
                  description: { type: Type.STRING }, 
                  duration: { type: Type.INTEGER } 
                }, 
                required: ["name", "description", "duration"] 
              } 
            } 
          }, 
          required: ["characterName", "status"] 
        } 
      },
      inventoryUpdates: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            characterName: { type: Type.STRING }, 
            action: { type: Type.STRING }, 
            cost: { type: Type.INTEGER }, 
            item: { 
              type: Type.OBJECT, 
              properties: { 
                name: { type: Type.STRING }, 
                description: { type: Type.STRING }, 
                effect: { type: Type.STRING }, 
                type: { type: Type.STRING }, 
                slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'], description: "Slot. 'back' = Costas (Mochila, Capa, Manto)." },
                price: { type: Type.INTEGER },
                capacityBonus: { type: Type.INTEGER, description: "Bônus de capacidade (Apenas Mochilas)." }
              },
              required: ["name", "description", "effect", "type"] 
            } 
          }, 
          required: ["characterName", "action", "item"] 
        } 
      },
      activeEnemies: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            id: { type: Type.STRING }, 
            name: { type: Type.STRING }, 
            description: { type: Type.STRING }, 
            currentHp: { type: Type.INTEGER }, 
            maxHp: { type: Type.INTEGER }, 
            currentMana: { type: Type.INTEGER }, 
            maxMana: { type: Type.INTEGER }, 
            currentStamina: { type: Type.INTEGER }, 
            maxStamina: { type: Type.INTEGER }, 
            difficulty: { type: Type.STRING }, 
            status: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  name: { type: Type.STRING }, 
                  description: { type: Type.STRING }, 
                  duration: { type: Type.INTEGER } 
                }, 
                required: ["name", "description", "duration"] 
              } 
            }, 
            skills: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  name: { type: Type.STRING }, 
                  description: { type: Type.STRING }, 
                  type: { type: Type.STRING }, 
                  level: { type: Type.INTEGER } 
                }, 
                required: ["name", "description", "type", "level"] 
              } 
            } 
          }, 
          required: ["id", "name", "description", "currentHp", "maxHp", "difficulty"] 
        } 
      },
      activeAllies: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            id: { type: Type.STRING }, 
            name: { type: Type.STRING }, 
            description: { type: Type.STRING }, 
            currentHp: { type: Type.INTEGER }, 
            maxHp: { type: Type.INTEGER }, 
            currentMana: { type: Type.INTEGER }, 
            maxMana: { type: Type.INTEGER }, 
            currentStamina: { type: Type.INTEGER }, 
            maxStamina: { type: Type.INTEGER }, 
            status: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  name: { type: Type.STRING }, 
                  description: { type: Type.STRING }, 
                  duration: { type: Type.INTEGER } 
                }, 
                required: ["name", "description", "duration"] 
              } 
            } 
          }, 
          required: ["id", "name", "description", "currentHp", "maxHp"] 
        } 
      },
      activeNeutrals: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            role: { type: Type.STRING, enum: ['Merchant', 'Civilian', 'Animal', 'Other'] },
            currentHp: { type: Type.INTEGER },
            maxHp: { type: Type.INTEGER },
            isMerchant: { type: Type.BOOLEAN },
            shopItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  effect: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['consumable', 'equipment', 'misc'] },
                  slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'], description: "Slot. 'back' = Costas (Mochila, Capa, Manto)." },
                  price: { type: Type.INTEGER },
                  capacityBonus: { type: Type.INTEGER, description: "Bônus de capacidade (Apenas Mochilas)." }
                },
                required: ["name", "description", "effect", "type", "price"]
              }
            },
            status: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT, 
                properties: { 
                  name: { type: Type.STRING }, 
                  description: { type: Type.STRING }, 
                  duration: { type: Type.INTEGER } 
                }, 
                required: ["name", "description", "duration"] 
              } 
            }
          },
          required: ["id", "name", "description", "role", "currentHp", "maxHp", "isMerchant"]
        }
      },
      nearbyItems: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, effect: { type: Type.STRING }, type: { type: Type.STRING }, slot: { type: Type.STRING }, capacityBonus: { type: Type.INTEGER } }, required: ["name", "description", "effect", "type"] } },
      mapData: { type: Type.OBJECT, properties: { locationName: { type: Type.STRING }, grid: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } }, legend: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["symbol", "description"] } } }, required: ["locationName", "grid", "legend"] },
      timeData: { type: Type.OBJECT, properties: { dayCount: { type: Type.INTEGER }, phase: { type: Type.STRING, enum: ['DAWN', 'DAY', 'DUSK', 'NIGHT'] }, description: { type: Type.STRING } }, required: ["dayCount", "phase", "description"] }
    },
    required: ["storyText", "systemLogs", "isGameOver", "attributeChanges", "resourceChanges", "inventoryUpdates", "activeEnemies", "activeAllies", "activeNeutrals", "nearbyItems", "mapData", "timeData"]
  };

  const prompt = `
  Mundo: ${world.premise}
  Moeda: ${world.currencyName}

  ${timeContext}
  AVANÇO DO TEMPO: Baseado nas ações e narrativa, avance o tempo de forma lógica.
  
  ${extraInstructions}

  CONTEXTO DE HABILIDADES:
  ${characterSkillsContext}
  *LEMBRE-SE*: Personagens devem agir de acordo com suas FRAQUEZAS (Flaws) e FORÇAS (Strengths). Se um personagem tem fraqueza "Covarde" e tenta atacar um Boss, narre o medo dele. Se tem força "Destemido", narre sua bravura.

  ${enemySkillsContext}

  HISTÓRICO RECENTE (Otimizado):
  ${context.slice(-4000)} 

  CONTEXTO ATUAL:
  ${enemyContext}
  ${neutralContext}

  AÇÕES (JOGADORES):
  ${actionContext}

  INSTRUÇÕES CRÍTICAS (PARA CORRIGIR BUGS):
  1. **DANO REAL**: Se você narrar que um inimigo atacou e feriu um personagem (ou vice-versa), você **DEVE** adicionar uma entrada em 'resourceChanges' com valor NEGATIVO. (Ex: {characterName: "Alaric", resource: "hp", value: -10}). SEM ISSO O JOGO TRAVA.
  2. **LOOT REAL**: Se você narrar que um item caiu, foi dropado ou encontrado, você **DEVE** adicionar esse item ao array 'nearbyItems' do JSON.
  3. **CHECAGEM DE PASSIVAS**: Antes de gerar o texto, leia as "PASSIVAS" listadas acima.
  4. **SKILLS DE INIMIGOS**: Use as skills listadas para os inimigos para tornar o combate variado.

  - **COMÉRCIO**: Se os jogadores comprarem algo, deduza o dinheiro via 'inventoryUpdates' (campo 'cost').
  - **NEUTROS**: Gerencie a lista 'activeNeutrals'.
  - **MAPA OBRIGATÓRIO**.
  - **SEM DADOS NO TEXTO**: Não escreva "(D20: X)" ou valores numéricos de rolagem na história.
  `;

  return callWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    if (!response.text) throw new Error("Resposta vazia da IA");
    return JSON.parse(cleanJson(response.text)) as TurnResponse;
  });
};
