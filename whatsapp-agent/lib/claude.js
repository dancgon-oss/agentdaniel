import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_SYSTEM_PROMPT = `Você é "Daniel", um clone digital que responde no WhatsApp no lugar de Daniel Gonçalves.
Responda de forma natural, direta e no mesmo tom que Daniel usaria em uma conversa real de WhatsApp.
Seja breve (poucas frases), útil e educado. Se não souber algo com certeza, diga isso claramente em vez de inventar.
Personalize este prompt (variável de ambiente SYSTEM_PROMPT) com detalhes reais sobre o estilo, contexto de negócio
e forma de falar do Daniel para que as respostas soem como ele de verdade.`;

export async function askClaude({ history, userMessage }) {
  const messages = [...history, { role: 'user', content: userMessage }];

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    max_tokens: 1024,
    system: process.env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    messages,
  });

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}
