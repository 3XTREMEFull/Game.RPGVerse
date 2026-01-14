
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { WorldData, Character, NarrativeTurn, Skill, Attributes, RollResult, TurnResponse, DerivedStats, ResourceChange, Item, Enemy, MapData, StatusEffect, CharacterStatusUpdate, Ally } from "../types";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Função helper para tentar reconectar automaticamente em caso de falha
// Refatorada para ser iterativa e lidar infinitamente com erros de Cota (429)
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let attempt = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMessage = error?.message || JSON.stringify(error);
      // Detecção robusta de erros de cota/limite
      const isQuotaError = errorMessage.includes('429') || 
                           errorMessage.includes('quota') || 
                           errorMessage.includes('resource exhausted') ||
                           errorMessage.includes('Too Many Requests') ||
                           errorMessage.includes('user has exceeded quota');

      // Se for erro de cota, tenta infinitamente (como solicitado). Se for outro erro, respeita o maxRetries.
      const shouldRetry = isQuotaError || attempt < maxRetries;

      if (shouldRetry) {
        attempt++;
        // Se for cota, espera 15s fixos (RPM limit costuma resetar em 1 min, então 4 tentativas cobrem). 
        // Se for erro genérico, backoff exponencial.
        const waitTime = isQuotaError ? 15000 : delay;
        
        console.warn(`[Gemini Service] Erro detectado (Tentativa ${attempt}). Tipo: ${isQuotaError ? 'QUOTA/429' : 'GENÉRICO'}. Aguardando ${waitTime}ms...`, error);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Aumenta o delay exponencialmente apenas para erros não-cota
        if (!isQuotaError) {
            delay = Math.min(delay * 2, 30000); // Cap em 30s
        }
      } else {
        // Esgotou tentativas de erro genérico
        console.error("Máximo de tentativas excedido para erro genérico.");
        throw error;
      }
    }
  }
}

const SYSTEM_INSTRUCTION = `
Você é o Mestre de Jogo (GM) para um RPG textual colaborativo. 
Seu papel é:
1. Definir o cenário e temas.
2. Gerenciar a história e o OBJETIVO FINAL.
3. Adjudicar ações usando o SISTEMA DE REGRAS ESPECÍFICO abaixo.
4. Responda SEMPRE em Português do Brasil (pt-BR).

=== DIRETRIZES DE NARRATIVA (ALTA PRIORIDADE) ===
- **ESTILO LITERÁRIO**: Não seja breve. Escreva descrições ricas, atmosféricas e detalhadas. Use metáforas e descreva os sentidos (cheiros, sons, luzes).
- **RITMO VARIADO**: Não force combate a todo turno. Permita cenas de exploração, mistério, interação social e introspecção.
- **FOCO NO ENREDO**: Avance a trama principal e as subtramas dos personagens. Use ganchos narrativos baseados nas Motivações dos personagens.

=== SISTEMA DE REGRAS (IMUTÁVEL) ===
ATRIBUTOS (Escala 1-10):
- FOR (Força), DES (Destreza), CON (Constituição), INT (Inteligência), SAB (Sabedoria), CAR (Carisma), AGI (Agilidade), SOR (Sorte).
- Modificador = Atributo - 2.

AVALIAÇÃO DE DIFICULDADE (DC):
- DC 8 (Muito Fácil) a DC 22 (Lendária).

FÓRMULA DE TESTE & BÔNUS DE ITENS:
- 1d20 + Modificador + Habilidade >= DC Escolhida.
- **IMPORTANTE: SLOT 'MÃOS' (hands)**:
  - Se o jogador atacar ou agir usando o item equipado no slot 'hands', você DEVE:
    1. **NARRATIVA**: Descrever explicitamente o uso daquele item (ex: "Você dispara sua Pistola M9...", "Você brande seu Machado...").
    2. **MECÂNICA**: Aplicar AUTOMATICAMENTE o 'effect' do item ao resultado. Se o item diz "+2 em ataque", some +2 mentalmente ao dado do jogador para definir o sucesso. Se diz "+1d4 dano de fogo", aplique esse dano extra na resolução.
  - Não pergunte se ele quer usar. Se está equipado e a ação é compatível (ex: Ataque), assuma o uso.

COMBATE, INIMIGOS E ALIADOS:
- Defina HP baseado na dificuldade (Minion: 10-20, Elite: 40-80, Boss: 150+).
- **USO OBRIGATÓRIO DE DADOS DE INIMIGOS**: O prompt fornecerá as rolagens D20 para cada inimigo. USE esses valores para determinar se eles acertam ou erram os jogadores.

RECURSOS & MATEMÁTICA (CRÍTICO):
- **REGRA DE SINAL**: Para DANO ou CUSTO, você DEVE usar valores **NEGATIVOS** (ex: -10 HP, -5 Mana). Para CURA ou RECUPERAÇÃO, use valores POSITIVOS (ex: +5 HP).
- **LOG DE BATALHA**: Ao causar dano em um INIMIGO ou ALIADO, adicione uma entrada em 'resourceChanges'.

LOOT & ITENS E EQUIPAMENTOS:
- **CLASSIFICAÇÃO DE ITENS**:
  - Use o campo 'type' para definir o tipo de item: 'consumable' (poções, comida), 'equipment' (armas, roupas) ou 'misc'.
- **SLOTS DE EQUIPAMENTO**:
  - 'hands': Armas, Varinhas, Escudos, Ferramentas. (ESTE É O SLOT PRINCIPAL DE ATAQUE).
  - 'back': Mochilas.
  - 'chest': Armaduras, Roupas.
- Ao gerar itens iniciais, garanta que pelo menos um seja uma ARMA ou FERRAMENTA para o slot 'hands' com um efeito mecânico claro (ex: "Faca Curta", effect: "+1 em rolagens de acerto").

MAPA & NAVEGAÇÃO:
- O mapa é uma grade 5x5 representando a REGIÃO IMEDIATA.
- Use Emojis para Personagens (👤), Inimigos (👹) e Aliados (🛡️).
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

export const startNarrative = async (world: WorldData, characters: Character[]): Promise<{ storyText: string; activeEnemies: Enemy[]; mapData: MapData }> => {
  const characterDescriptions = characters.map(c => `- ${c.name} (${c.concept})`).join('\n');

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
        storyText: { type: Type.STRING, description: "A descrição longa e imersiva da cena inicial (mínimo 2 parágrafos)." },
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
    required: ["storyText", "activeEnemies", "mapData"]
  };

  const prompt = `
  PERSONAGENS:
  ${characterDescriptions}

  Mundo: ${world.premise}
  Conflito: ${world.coreConflict}

  Escreva uma introdução longa e atmosférica. Estabeleça o cenário com detalhes sensoriais.
  Se houver perigo imediato, gere inimigos. Se for uma cena de exploração/mistério, a lista de inimigos pode ser vazia.
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
    return JSON.parse(response.text) as { storyText: string; activeEnemies: Enemy[]; mapData: MapData };
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
  enemyRolls: Record<string, RollResult> = {}
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
    
    // Explicitamente destacar o item nas mãos para a IA
    const handsItem = char.equipment?.hands;
    const handsInfo = handsItem 
        ? `[ITEM EQUIPADO NAS MÃOS (ARMA PRINCIPAL): "${handsItem.name}". EFEITO MECÂNICO: "${handsItem.effect}". NARRATIVA: Use este item para descrever a ação se for um ataque/uso de ferramenta.]` 
        : "[MÃOS VAZIAS]";
    
    const otherEquipment = `Outros Equipamentos: ${JSON.stringify({ chest: char.equipment?.chest, back: char.equipment?.back })}`;

    return `PERSONAGEM: ${p.name}\n- AÇÃO DECLARADA: "${p.action}"\n- ROLAGEM: ${roll.type}(${roll.value})\n- ${handsInfo}\n- STATS: ${stats}\n- RECURSOS: ${derived}\n- ${otherEquipment}`;
  }).join('\n\n');

  const enemyContext = currentEnemies.length > 0 
    ? `INIMIGOS ATIVOS E SUAS ROLAGENS (D20) PARA ESTA RODADA:
       ${currentEnemies.map(e => {
           const roll = enemyRolls[e.id];
           return `- ${e.name} (${e.difficulty}, HP:${e.currentHp}, MP:${e.currentMana}, ST:${e.currentStamina}): ROLAGEM D20 = ${roll ? roll.value : 'N/A'}`;
       }).join('\n')}`
    : "NENHUM INIMIGO ATIVO.";

  const allyContext = currentAllies.length > 0
    ? `ALIADOS ATIVOS (CONTROLE ELES):
       ${currentAllies.map(a => `- ${a.name} (HP: ${a.currentHp}, MP: ${a.currentMana})`).join('\n')}`
    : "NENHUM ALIADO ATIVO.";

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      storyText: { type: Type.STRING, description: "Narrativa literária longa. Descreva o ambiente, reações e consequências." },
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
            value: { type: Type.INTEGER, description: "O valor numérico da mudança. IMPORTANTE: Use NÚMEROS NEGATIVOS para dano/perda (ex: -10) e POSITIVOS para cura/ganho (ex: +10)." },
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
    required: ["storyText", "isGameOver", "attributeChanges", "resourceChanges", "inventoryUpdates", "activeEnemies", "activeAllies", "nearbyItems", "mapData"]
  };

  const prompt = `
  Mundo: ${world.premise}
  Objetivo: ${world.mainObjective}

  HISTÓRICO RECENTE:
  ${context.slice(-8000)} 

  CONTEXTO DE COMBATE E ROLAGENS DOS INIMIGOS:
  ${enemyContext}

  CONTEXTO DE ALIADOS:
  ${allyContext}

  AÇÕES DA RODADA (JOGADORES):
  ${actionContext}

  INSTRUÇÕES FINAIS:
  - Escreva como um autor de fantasia.
  - **ITEM NAS MÃOS**: Se o jogador atacou, VERIFIQUE se há um item nas MÃOS (hands). Se houver, descreva o ataque usando essa arma e APLIQUE o bônus mecânico do item na resolução.
  - Se houver combate, use as rolagens fornecidas para narrar o sucesso/falha dos inimigos.
  - Se jogadores persuadirem NPCs com sucesso, mova-os de Inimigos para Aliados.
  - **LOOT**: Se itens forem encontrados, coloque-os em 'nearbyItems'. Se um item for uma mochila, defina slot='back' e capacityBonus.
  - Gerencie HP, Mana e Estamina dos inimigos, aliados e jogadores rigorosamente.
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