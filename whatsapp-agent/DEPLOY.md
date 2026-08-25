# Deploy do Agent Daniel (WhatsApp) — passo a passo

Este código está pronto, mas as etapas abaixo dependem de contas e credenciais
que só você pode criar/fornecer (Hugging Face, DNS, e o próprio WhatsApp no
seu celular). Nenhuma IA consegue fazer login em contas de terceiros por
você — siga os passos na ordem.

## ⚠️ Antes de tudo: rotacione a chave da Anthropic

Você colou uma `ANTHROPIC_API_KEY` real em uma conversa de chat. Esse tipo de
chave fica registrada em logs. Gere uma nova em
https://console.anthropic.com/settings/keys e revogue a antiga assim que
possível. Use apenas a chave nova daqui pra frente, e nunca a cole em texto
puro em chat ou em arquivos de código — apenas nos "secrets" do Space (passo 4).

## 1. Criar o banco de dados no Supabase

1. Acesse seu projeto: https://supabase.com/dashboard/project/eyntrzbszzjjwaveynpj
2. Vá em **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**.
3. Vá em **Settings → API** e copie a chave **service_role** (não a `anon`/`publishable`
   que você já tinha). Essa chave é secreta — só vai para os secrets do Space (passo 4),
   nunca para código de frontend.

## 2. Criar conta e Space no Hugging Face

1. Crie uma conta em https://huggingface.co/join (isso precisa ser feito por
   você — envolve verificação de e-mail).
2. Clique em **New Space** (https://huggingface.co/new-space):
   - Owner: sua conta
   - Space name: por exemplo `agent-daniel-whatsapp`
   - License: livre escolha
   - **SDK: Docker** (importante — não escolha Gradio/Streamlit)
   - Hardware: **CPU basic (free)** para começar
   - Visibility: Private (recomendado, já que o Space vai guardar segredos)

## 3. Enviar os arquivos deste projeto para o Space

Os Spaces do Hugging Face são repositórios git. Depois de criar o Space, você
terá uma URL do tipo `https://huggingface.co/spaces/SEU_USUARIO/agent-daniel-whatsapp`.

Na sua máquina (ou me dando um token de acesso do Hugging Face, eu posso rodar
isto para você):

```bash
cd whatsapp-agent
cp SPACE_README.md README.md   # o front-matter YAML define SDK docker + porta 7860

git init
git add .
git commit -m "Deploy inicial do Agent Daniel"
git branch -M main
git remote add space https://huggingface.co/spaces/SEU_USUARIO/agent-daniel-whatsapp
git push -f space main
```

Você vai precisar de um **User Access Token** do Hugging Face (Settings →
Access Tokens → New token, permissão "write") para autenticar o `git push`
(use o token como senha quando o git pedir usuário/senha).

## 4. Configurar os secrets do Space

No Space, vá em **Settings → Repository secrets** e adicione (valores reais,
nunca no código):

| Nome | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sua chave nova da Anthropic (ver aviso acima) |
| `SUPABASE_URL` | `https://eyntrzbszzjjwaveynpj.supabase.co` |
| `SUPABASE_SERVICE_KEY` | a service_role key copiada no passo 1 |
| `OPENAI_API_KEY` | opcional, necessária só para transcrever áudios (Whisper) |
| `SYSTEM_PROMPT` | opcional — descreva o Daniel real para personalizar as respostas |
| `ALLOWED_NUMBERS` | recomendado no início: seu próprio número (só dígitos, com DDI, ex `5511999999999`), para testar em privado antes de abrir geral |

O Space reinicia automaticamente ao salvar secrets.

## 5. Escanear o QR Code

1. Abra a URL pública do Space (algo como
   `https://SEU_USUARIO-agent-daniel-whatsapp.hf.space`).
2. Você verá um QR Code na tela (atualiza sozinha a cada 5s).
3. No WhatsApp do celular que vai ser o "Daniel": **Configurações → Aparelhos
   conectados → Conectar um aparelho** → escaneie o QR.
4. A página deve mudar para "Daniel está conectado ✅".

## 6. Testar

Mande uma mensagem de outro número para o WhatsApp conectado (se você
configurou `ALLOWED_NUMBERS`, use um número da lista). O bot deve responder
usando o Claude, e a conversa fica salva na tabela `messages` do Supabase.

## 7. Manter rodando 24/7 (importante)

Spaces gratuitos do Hugging Face **hibernam depois de um tempo sem tráfego
HTTP**, o que derruba a conexão do WhatsApp. Persistimos a sessão no Supabase
(tabela `wa_auth_kv`) exatamente para que, ao "acordar", o bot reconecte
**sem** pedir novo QR Code — mas ele só acorda quando alguém faz uma
requisição HTTP.

Solução gratuita: configure um monitor externo (ex.
[UptimeRobot](https://uptimerobot.com), grátis) para fazer um GET em
`https://SEU_USUARIO-agent-daniel-whatsapp.hf.space/health` a cada 5 minutos.
Isso mantém o Space acordado e a conexão do WhatsApp ativa.

## 8. Domínio agentdaniel.com.br

Spaces gratuitos do Hugging Face **não suportam domínio customizado** (isso é
recurso pago/PRO). Duas opções gratuitas:

**Opção A — Redirecionamento simples (mais fácil):** configure um redirect no
seu provedor de DNS/registrador de `agentdaniel.com.br` para a URL do Space.
O visitante vê a URL do `hf.space` na barra de endereço, mas funciona.

**Opção B — Cloudflare Worker como proxy reverso (URL final fica com seu domínio):**
1. Coloque o domínio `agentdaniel.com.br` na Cloudflare (grátis).
2. Crie um Worker com este código, e uma rota `agentdaniel.com.br/*` apontando pra ele:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "SEU_USUARIO-agent-daniel-whatsapp.hf.space";
    return fetch(new Request(url, request));
  },
};
```

Isso faz `agentdaniel.com.br` servir o mesmo conteúdo do Space (incluindo a
página do QR Code), sem custo.

Não tenho acesso ao seu registrador/DNS ou à sua conta Cloudflare, então este
passo precisa ser feito por você (ou me passe as credenciais/token de API
relevantes explicitamente, se quiser que eu automatize).
