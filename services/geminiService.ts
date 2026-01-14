
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { WorldData, Character, NarrativeTurn, Skill, Attributes, RollResult, TurnResponse, DerivedStats, ResourceChange, Item, Enemy, MapData, StatusEffect, CharacterStatusUpdate, Ally } from "../types";

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

1. PRINCÍPIO FUNDAMENTAL: UNIVERSALIDADE DAS REGRAS
• Regra Obrigatória: Todas as regras de dados e mecânicas descritas aplicam-se de forma absolutamente igual a todas as entidades do jogo: Personagens Jogáveis (PJs), Inimigos (NPCs Hostis) e Aliados (NPCs Amigáveis).
• Objetivo: Garantir justiça e consistência.

2. SISTEMA DE ROLAGEM AUTOMÁTICA E SEPARAÇÃO
• Ação: Você deve executar internamente todas as rolagens necessárias para o jogo (especialmente para Inimigos e Aliados).
• Para os Jogadores, use o resultado do dado fornecido no prompt (D20), mas calcule os bônus internamente.
• PROIBIDO: Incluir números de dados, resultados brutos, CDs ou cálculos no texto narrativo principal ('storyText').
• Processo:
  1. Decisão Interna: Decida qual dado e bônus usar.
  2. Rolagem/Cálculo Interno.
  3. Registro no Log: Gere uma entrada detalhada no array 'systemLogs'.
  4. Narração Limpa: Produza uma descrição puramente literária no 'storyText'.

3. LÓGICA DE DADOS (UNIVERSAL)
• Testes (Ataque, Habilidade, Resistência): Base D20. Sucesso = (d20 + bônus) >= DC.
• Dano/Cura: d4 (menor), d6 (comum), d8 (versátil), d10/d12 (pesado).

4. FORMATO OBRIGATÓRIO DO REGISTRO NO LOG ('systemLogs')
• Cada entrada no array deve seguir estritamente este formato string:
"[SISTEMA] [Entidade/Ação]: [Resultado Total] em [Tipo de Dado] + [Bônus] (Alvo: [CD] ou 'Dano/Cura'). [STATUS]"
• Exemplos:
  - "[SISTEMA] Ataque do Herói (Espada): 18 em d20 + 5 (Alvo: Defesa 15). SUCESSO."
  - "[SISTEMA] Dano do Orc (Machado): 7 em d8 + 3 (Alvo: Dano)."

5. COMBATE & RECURSOS
• Use valores NEGATIVOS para Dano/Perda (-10) e POSITIVOS para Cura (+5) em 'resourceChanges'.
• Item 'hands': Se o jogador atacar, verifique o item equipado em 'hands'. Aplique seu efeito mecânico automaticamente e narre seu uso.

6. ESTRUTURA
• Responda SEMPRE em Português do Brasil (pt-BR).
`;

const MODEL_NAME = "gemini-3-flash-preview";

export const generateWorldPremise = async (manualInput?: string): Promise<WorldData> => {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      premise: { type: Type.STRING, description: "A detailed setting description." },
      themes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-5 themes or tonal keywords." },
      coreConflict: { type: Type.STRING, description: "The starting point of the story and main conflict." },
      mainObjective: { type: Type.STRING, description: "The specific final goal players must achieve to win the campaign." }
    },
    required: ["premise", "themes", "coreConflict", "mainObjective"]
  };

  let prompt = "Crie uma premissa de mundo de RPG única, temas, um conflito central e um OBJETIVO FINAL CLARO. Seja criativo e detalhista.";
  
  if (manualInput) {
    prompt = `Com base na seguinte ideia do usuário: "${manualInput}", expanda e crie uma premissa detalhada, temas, conflito e um OBJETIVO FINAL claro.`;
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

export const generateCharacterDetails = async (world: WorldData, characterConcept: string): Promise<{ skills: Skill[], attributes: Attributes, derived: DerivedStats, startingItems: Item[] }> => {
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
      }
    },
    required: ["skills", "attributes", "startingItems"]
  };

  const prompt = `
  Mundo: ${world.premise}
  Conceito do Personagem: ${characterConcept}
  
  Gere atributos equilibrados (1-5), 4 habilidades temáticas e 3 itens iniciais.
  IMPORTANTE:
  - Gere pelo menos 1 item com slot='hands' (uma arma ou ferramenta principal para o conceito).
  - No campo 'effect' deste item, coloque um bônus mecânico claro (Ex: "+2 Acerto", "Dano +1d6").
  - Se o personagem tiver uma mochila, defina slot='back' e capacityBonus.
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

    const data = JSON.parse(response.text) as { skills: Skill[], attributes: Attributes, startingItems: Item[] };
    
    const derived: DerivedStats = {
      hp: 10 + (data.attributes.CON * 5),
      stamina: 5 + (data.attributes.FOR + data.attributes.AGI) * 2,
      mana: 5 + (data.attributes.INT * 3)
    };

    return { ...data, derived };
  });
};

export const startNarrative = async (world: WorldData, characters: Character[]): Promise<{ storyText: string; activeEnemies: Enemy[]; activeAllies: Ally[]; mapData: MapData }> => {
  const characterDescriptions = characters.map(c => `- ${c.name} (${c.concept})`).join('\n');

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
        storyText: { type: Type.STRING, description: "A descrição longa e imersiva da cena inicial." },
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
        mapData: {
            type: Type.OBJECT,
            properties: {
                locationName: { type: Type.STRING },
                grid: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    },
                    description: "5x5 grid array. Use '.' for empty road/terrain, and Emojis for POIs/Actors."
                },
                legend: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            symbol: { type: Type.STRING },
                            description: { type: Type.STRING }
                        },
                        required: ["symbol", "description"]
                    }
                }
            },
            required: ["locationName", "grid", "legend"]
        }
    },
    required: ["storyText", "activeEnemies", "activeAllies", "mapData"]
  };

  const prompt = `
  PERSONAGENS:
  ${characterDescriptions}

  Mundo: ${world.premise}
  Conflito: ${world.coreConflict}

  Escreva uma introdução longa e atmosférica. Estabeleça o cenário com detalhes sensoriais.
  Se houver perigo imediato, gere inimigos. 
  
  **CORREÇÃO DE ALIADOS**: Analise os backgrounds e conexões dos personagens. Se eles tiverem aliados lógicos presentes na cena (ex: pets, escudeiros, NPCs da história), você DEVE gerá-los e colocá-los na lista 'activeAllies'.

  IMPORTANTE: Gere o mapa (mapData) correspondente à cena inicial com Locais de Interesse (POIs) e a posição inicial dos personagens.
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
    return JSON.parse(response.text) as { storyText: string; activeEnemies: Enemy[]; activeAllies: Ally[]; mapData: MapData };
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
  // Removido enemyRolls do cliente. A IA rola internamente.
): Promise<TurnResponse> => {
  const context = history.map(h => {
      if (h.role === 'system') return `[SISTEMA]: ${h.content}`;
      return `${h.role === 'gm' ? 'GM' : 'JOGADORES'}: ${h.content}`;
  }).join('\n\n');
  
  const actionContext = playerActions.map(p => {
    const char = characters.find(c => c.name === p.name);
    const roll = rolls[char?.id || ''];
    if (!char || !roll) return `Ação: ${p.action}`;
    
    const stats = JSON.stringify(char.attributes);
    const derived = JSON.stringify(char.derived);
    
    const handsItem = char.equipment?.hands;
    const handsInfo = handsItem 
        ? `[ITEM EQUIPADO NAS MÃOS (ARMA PRINCIPAL): "${handsItem.name}". EFEITO MECÂNICO: "${handsItem.effect}". NARRATIVA: Use este item para descrever a ação se for um ataque/uso de ferramenta.]` 
        : "[MÃOS VAZIAS]";
    
    const otherEquipment = `Outros Equipamentos: ${JSON.stringify({ chest: char.equipment?.chest, back: char.equipment?.back })}`;

    return `PERSONAGEM: ${p.name}\n- AÇÃO DECLARADA: "${p.action}"\n- ROLAGEM DO JOGADOR: ${roll.type}(${roll.value}) (Aplique os bônus internamente)\n- ${handsInfo}\n- STATS: ${stats}\n- RECURSOS: ${derived}\n- ${otherEquipment}`;
  }).join('\n\n');

  const enemyContext = currentEnemies.length > 0 
    ? `INIMIGOS ATIVOS (IA CONTROLA E ROLA DADOS INTERNAMENTE):
       ${currentEnemies.map(e => {
           return `- ${e.name} (${e.difficulty}, HP:${e.currentHp}, MP:${e.currentMana}, ST:${e.currentStamina})`;
       }).join('\n')}`
    : "NENHUM INIMIGO ATIVO.";

  const allyContext = currentAllies.length > 0
    ? `ALIADOS ATIVOS (IA CONTROLA E ROLA DADOS INTERNAMENTE):
       ${currentAllies.map(a => `- ${a.name} (HP: ${a.currentHp}, MP: ${a.currentMana})`).join('\n')}`
    : "NENHUM ALIADO ATIVO.";

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      storyText: { type: Type.STRING, description: "Narrativa literária pura. SEM NÚMEROS DE DADOS, SEM CDs." },
      systemLogs: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING }, 
        description: "Lista de strings formatadas: '[SISTEMA] [Ação]: [Resultado]...'. OBRIGATÓRIO para todas as rolagens." 
      },
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
            value: { type: Type.INTEGER, description: "Negativo para dano, positivo para cura." },
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
            action: { type: Type.STRING, enum: ["ADD", "REMOVE"] },
            item: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    effect: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['consumable', 'equipment', 'misc'] },
                    slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'] },
                    capacityBonus: { type: Type.INTEGER }
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
                difficulty: { type: Type.STRING, enum: ["Minion", "Elite", "Boss"] },
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
            required: ["id", "name", "description", "currentHp", "maxHp", "currentMana", "maxMana", "currentStamina", "maxStamina"]
        }
      },
      nearbyItems: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                effect: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['consumable', 'equipment', 'misc'] },
                slot: { type: Type.STRING, enum: ['back', 'chest', 'hands'] },
                capacityBonus: { type: Type.INTEGER }
            },
            required: ["name", "description", "effect", "type"]
        }
      },
      mapData: {
        type: Type.OBJECT,
        properties: {
            locationName: { type: Type.STRING },
            grid: {
                type: Type.ARRAY,
                items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                },
                description: "5x5 grid array. Use '.' for empty road/terrain, and Emojis for POIs/Actors."
            },
            legend: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        symbol: { type: Type.STRING },
                        description: { type: Type.STRING }
                    },
                    required: ["symbol", "description"]
                }
            }
        },
        required: ["locationName", "grid", "legend"]
      }
    },
    required: ["storyText", "systemLogs", "isGameOver", "attributeChanges", "resourceChanges", "inventoryUpdates", "activeEnemies", "activeAllies", "nearbyItems", "mapData"]
  };

  const prompt = `
  Mundo: ${world.premise}
  Objetivo: ${world.mainObjective}

  HISTÓRICO RECENTE:
  ${context.slice(-8000)} 

  CONTEXTO DE COMBATE INIMIGO E ALIADO:
  ${enemyContext}
  ${allyContext}

  AÇÕES DA RODADA (JOGADORES):
  ${actionContext}

  INSTRUÇÕES FINAIS:
  - **SEPARAÇÃO RIGOROSA**:
    1. 'systemLogs': Aqui você coloca os cálculos. Ex: "[SISTEMA] Goblin (Ataque): 15 em d20 + 3 (vs Defesa 14). SUCESSO."
    2. 'storyText': Aqui você escreve a cena LITERÁRIA. "O goblin salta e corta seu braço." (SEM NÚMEROS).
  - **ITEM NAS MÃOS**: Se o jogador atacou, descreva usando a arma equipada.
  - **ROLA AS AÇÕES DA IA**: Você deve decidir e rolar (internamente) para todos os Inimigos e Aliados.
  - **LOG**: O campo resourceChanges deve conter TODAS as mudanças numéricas da rodada.
  - **MAPA**: ATUALIZE o mini-mapa 5x5.
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
