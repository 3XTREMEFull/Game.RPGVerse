
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { WorldData, Character, NarrativeTurn, Skill, Attributes, RollResult, TurnResponse, DerivedStats, ResourceChange, Item, Enemy, MapData, StatusEffect, CharacterStatusUpdate, Ally, TimeData, NeutralNPC } from "../types";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Função helper para tentar reconectar automaticamente em caso de falha
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMessage = error?.message || JSON.stringify(error);
      const isQuotaError = errorMessage.includes('429') || 
                           errorMessage.includes('quota') || 
                           errorMessage.includes('resource exhausted') ||
                           errorMessage.includes('Too Many Requests') ||
                           errorMessage.includes('user has exceeded quota');

      const shouldRetry = isQuotaError || attempt < maxRetries;

      if (shouldRetry) {
        attempt++;
        const waitTime = isQuotaError ? 15000 : delay;
        console.warn(`[Gemini Service] Erro detectado (Tentativa ${attempt}). Tipo: ${isQuotaError ? 'QUOTA/429' : 'GENÉRICO'}. Aguardando ${waitTime}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        if (!isQuotaError) delay = Math.min(delay * 2, 30000);
      } else {
        console.error("Máximo de tentativas excedido para erro genérico.");
        throw error;
      }
    }
  }
}

const SYSTEM_INSTRUCTION = `
Você é o Mestre de Jogo (GM) para um RPG textual colaborativo.

Seu papel é:
1. Definir o cenário, temas e a MOEDA DO MUNDO (Ouro, Créditos, Comida, etc).
2. Gerenciar a história, o OBJETIVO FINAL e o TEMPO (Ciclo Dia/Noite).
3. Adjudicar ações usando o SISTEMA DE REGRAS ESPECÍFICO abaixo.
4. Responda SEMPRE em Português do Brasil (pt-BR).

=== DIRETRIZES DE NARRATIVA E TEMPO ===
- **CICLO DIA/NOITE**: Você DEVE manter a continuidade do tempo. Se a cena anterior foi à tarde e eles viajaram, agora pode ser noite. Retorne sempre o objeto 'timeData'.
- **ESTILO LITERÁRIO**: Não seja breve. Escreva descrições ricas, atmosféricas e detalhadas.
- **RITMO VARIADO**: Não force combate a todo turno. Permita cenas de exploração e comércio.

=== SISTEMA DE REGRAS (IMUTÁVEL) ===
ATRIBUTOS (Escala 1-10): FOR, DES, CON, INT, SAB, CAR, AGI, SOR. Modificador = Atributo - 2.

**IMPORTANTE: SLOT 'MÃOS' (hands)**:
  - Se o jogador atacar com item equipado, aplique bônus mecânicos automaticamente.

**HABILIDADES E PASSIVAS**:
- Você deve ler as 'SKILLS' fornecidas no contexto da ação.
- Se uma habilidade dá bônus (ex: "Dobrar bônus de FOR", "Furtividade"), APLIQUE-O na narração e no resultado.
- Passivas devem ser verificadas automaticamente.

COMBATE, INIMIGOS, ALIADOS E NEUTROS:
- Inimigos (Vermelho): Hostis.
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
- Use Emojis: Personagens (👤), Inimigos (👹), Aliados (🛡️), Neutros/Mercadores (💰).
- **O MAPA É OBRIGATÓRIO EM TODOS OS TURNOS**.

1. PRINCÍPIO FUNDAMENTAL: UNIVERSALIDADE DAS REGRAS
• Regra Obrigatória: Todas as regras de dados e mecânicas descritas aplicam-se de forma absolutamente igual a todas as entidades do jogo.

2. SISTEMA DE ROLAGEM AUTOMÁTICA E SEPARAÇÃO
• Ação: Você deve executar internamente todas as rolagens necessárias para o jogo.
• Processo: Decisão Interna -> Rolagem -> Log em 'systemLogs' -> Narração em 'storyText'.
`;

const MODEL_NAME = "gemini-3-flash-preview";

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
    return JSON.parse(response.text) as WorldData;
  });
};

export const generateCharacterDetails = async (world: WorldData, characterConcept: string): Promise<{ skills: Skill[], attributes: Attributes, derived: DerivedStats, startingItems: Item[], wealth: number }> => {
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
            slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'], description: "Slot de equipamento." },
            capacityBonus: { type: Type.INTEGER, description: "Only for 'back' items (backpacks)." }
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
  Conceito do Personagem: ${characterConcept}
  
  Gere atributos equilibrados (1-5), 4 habilidades temáticas, 3 itens iniciais e o dinheiro inicial (${world.currencyName}) apropriado para o status do personagem.
  IMPORTANTE:
  - Gere pelo menos 1 item com slot='hands'.
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

    const data = JSON.parse(response.text) as { skills: Skill[], attributes: Attributes, startingItems: Item[], wealth: number };
    
    const derived: DerivedStats = {
      hp: 10 + (data.attributes.CON * 5),
      stamina: 5 + (data.attributes.FOR + data.attributes.AGI) * 2,
      mana: 5 + (data.attributes.INT * 3)
    };

    return { ...data, derived };
  });
};

export const startNarrative = async (world: WorldData, characters: Character[]): Promise<{ storyText: string; activeEnemies: Enemy[]; activeAllies: Ally[]; activeNeutrals: NeutralNPC[]; mapData: MapData; timeData: TimeData }> => {
  const characterDescriptions = characters.map(c => `- ${c.name} (${c.concept})`).join('\n');

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
                    difficulty: { type: Type.STRING, enum: ["Minion", "Elite", "Boss"] }
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
                                slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'] },
                                price: { type: Type.INTEGER }
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
    return JSON.parse(response.text) as { storyText: string; activeEnemies: Enemy[]; activeAllies: Ally[]; activeNeutrals: NeutralNPC[]; mapData: MapData; timeData: TimeData };
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
  const context = history.map(h => {
      if (h.role === 'system') return `[SISTEMA]: ${h.content}`;
      return `${h.role === 'gm' ? 'GM' : 'JOGADORES'}: ${h.content}`;
  }).join('\n\n');
  
  const actionContext = playerActions.map(p => {
    const char = characters.find(c => c.name === p.name);
    const roll = rolls[char?.id || ''];
    // Se o personagem estiver inconsciente (HP <= 0 e permadeath on), a ação vem vazia ou marcada
    if (!p.action || p.action === "INCONSCIENTE/CAÍDO") {
        return `PERSONAGEM: ${p.name} está CAÍDO/INCONSCIENTE (HP <= 0) e não pode agir.`;
    }

    if (!char || !roll) return `Ação: ${p.action}`;
    
    const stats = JSON.stringify(char.attributes);
    // Inclui skills no contexto para a IA saber das passivas
    const skills = char.skills.map(s => `[${s.type.toUpperCase()}] ${s.name}: ${s.description}`).join('; ');
    
    const handsItem = char.equipment?.hands;
    const handsInfo = handsItem 
        ? `[ITEM: "${handsItem.name}". EFEITO: "${handsItem.effect}"]` 
        : "[MÃOS VAZIAS]";
    
    return `PERSONAGEM: ${p.name}\n- AÇÃO: "${p.action}"\n- DADO: ${roll.type}(${roll.value})\n- ${handsInfo}\n- SKILLS: ${skills}\n- STATS: ${stats}\n- DINHEIRO: ${char.wealth} ${world.currencyName}`;
  }).join('\n\n');

  const enemyContext = currentEnemies.length > 0 
    ? `INIMIGOS ATIVOS: ${currentEnemies.map(e => `- ${e.name} (${e.difficulty}, HP:${e.currentHp})`).join('\n')}`
    : "NENHUM INIMIGO.";

  const neutralContext = currentNeutrals.length > 0
    ? `NEUTROS ATIVOS: ${currentNeutrals.map(n => `- ${n.name} (${n.role}, Merchant:${n.isMerchant})`).join('\n')}`
    : "NENHUM NEUTRO.";

  const timeContext = currentTime 
    ? `TEMPO ATUAL: Dia ${currentTime.dayCount}, Fase: ${currentTime.phase} (${currentTime.description}).`
    : "TEMPO: Inicio.";

  let extraInstructions = "";
  if (permadeathEnabled) {
      extraInstructions += `\n**MODO MORTE HABILITADO**:
      - Personagens com HP <= 0 ficam no estado "CAÍDO" (Inconsciente).
      - Narre uma oportunidade dramática para os aliados salvarem o personagem caído nesta cena.
      - Se ninguém salvar (cura ou teste de medicina) após uma rodada crítica, o personagem MORRE definitivamente.
      - Se TODOS os jogadores estiverem mortos ou caídos sem aliados para ajudar, defina 'isGameOver: true' e 'gameResult: DEFEAT'.
      `;
  }

  if (humanGmSuggestion) {
      extraInstructions += `\n**SUGESTÃO DO GM HUMANO (PRIORIDADE MÁXIMA)**: O GM humano instruiu: "${humanGmSuggestion}". Você DEVE incorporar essa sugestão na narrativa da próxima cena, criando os inimigos, eventos ou itens que o GM solicitou, mas mantendo as regras de dados e atributos.`;
  }

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      storyText: { type: Type.STRING },
      systemLogs: { type: Type.ARRAY, items: { type: Type.STRING } },
      isGameOver: { type: Type.BOOLEAN },
      gameResult: { type: Type.STRING, enum: ["VICTORY", "DEFEAT", "ONGOING"] },
      attributeChanges: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { characterName: { type: Type.STRING }, attribute: { type: Type.STRING }, value: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["characterName", "attribute", "value", "reason"] } },
      resourceChanges: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { characterName: { type: Type.STRING }, resource: { type: Type.STRING }, value: { type: Type.INTEGER }, reason: { type: Type.STRING } }, required: ["characterName", "resource", "value", "reason"] } },
      characterStatusUpdates: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { characterName: { type: Type.STRING }, status: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, duration: { type: Type.INTEGER } }, required: ["name", "description", "duration"] } } }, required: ["characterName", "status"] } },
      inventoryUpdates: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { characterName: { type: Type.STRING }, action: { type: Type.STRING }, cost: { type: Type.INTEGER }, item: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, effect: { type: Type.STRING }, type: { type: Type.STRING }, slot: { type: Type.STRING }, price: { type: Type.INTEGER } }, required: ["name", "description", "effect", "type"] } }, required: ["characterName", "action", "item"] } },
      activeEnemies: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING }, currentHp: { type: Type.INTEGER }, maxHp: { type: Type.INTEGER }, currentMana: { type: Type.INTEGER }, maxMana: { type: Type.INTEGER }, currentStamina: { type: Type.INTEGER }, maxStamina: { type: Type.INTEGER }, difficulty: { type: Type.STRING }, status: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, duration: { type: Type.INTEGER } }, required: ["name", "description", "duration"] } } }, required: ["id", "name", "description", "currentHp", "maxHp", "difficulty"] } },
      activeAllies: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, description: { type: Type.STRING }, currentHp: { type: Type.INTEGER }, maxHp: { type: Type.INTEGER }, currentMana: { type: Type.INTEGER }, maxMana: { type: Type.INTEGER }, currentStamina: { type: Type.INTEGER }, maxStamina: { type: Type.INTEGER }, status: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, duration: { type: Type.INTEGER } }, required: ["name", "description", "duration"] } } }, required: ["id", "name", "description", "currentHp", "maxHp"] } },
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
                                slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'] },
                                price: { type: Type.INTEGER }
                            },
                            required: ["name", "description", "effect", "type", "price"]
                        }
                    },
                    status: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, duration: { type: Type.INTEGER } }, required: ["name", "description", "duration"] } }
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
  AVANÇO DO TEMPO: Baseado nas ações e narrativa, avance o tempo de forma lógica (ex: Tarde -> Noite). Se passaram a noite em algum lugar, avance o dia.
  
  ${extraInstructions}

  HISTÓRICO RECENTE:
  ${context.slice(-8000)} 

  CONTEXTO:
  ${enemyContext}
  ${neutralContext}

  AÇÕES (JOGADORES):
  ${actionContext}

  INSTRUÇÕES:
  - **SKILLS**: Verifique as skills listadas acima. Se um jogador usa uma skill, verifique se ele a possui. Aplique bônus de passivas.
  - **ITENS**: Se você gerar itens no cenário (drop de inimigos, baús, achados), PREENCHA 'nearbyItems'. Se não preencher, eles não aparecerão no jogo.
  - **COMÉRCIO**: Se os jogadores comprarem algo (narrado ou sistema), deduza o dinheiro via 'inventoryUpdates' (usando campo 'cost' ou narrando).
  - **NEUTROS**: Gerencie a lista 'activeNeutrals'. Se um civil for atacado, ele pode virar Inimigo (mova para activeEnemies).
  - **CONTINUIDADE**: Lembre-se do tempo anterior.
  - **MAPA OBRIGATÓRIO**.
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
    return JSON.parse(response.text) as TurnResponse;
  });
};