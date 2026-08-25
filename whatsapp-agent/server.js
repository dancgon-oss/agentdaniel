import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Boom } from '@hapi/boom';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';

import { useSupabaseAuthState } from './lib/supabaseAuthState.js';
import { askClaude } from './lib/claude.js';
import { transcribeAudio } from './lib/transcribe.js';
import { logMessage, getHistory } from './lib/supabaseLog.js';

const PORT = process.env.PORT || 7860;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

for (const key of ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
  if (!process.env[key]) {
    logger.error(`Variável de ambiente obrigatória ausente: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const allowList = (process.env.ALLOWED_NUMBERS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let latestQR = null;
let connectionStatus = 'starting';

// --- HTTP status/QR page -----------------------------------------------
const app = express();

app.get('/health', (_req, res) => res.json({ status: connectionStatus }));

app.get('/', async (_req, res) => {
  if (connectionStatus === 'open') {
    return res.send('<html><body style="font-family:sans-serif;text-align:center"><h1>Daniel está conectado ✅</h1></body></html>');
  }
  if (latestQR) {
    const dataUrl = await QRCode.toDataURL(latestQR);
    return res.send(`<html><body style="font-family:sans-serif;text-align:center">
      <h2>Escaneie o QR Code no WhatsApp (Aparelhos conectados)</h2>
      <img src="${dataUrl}" alt="QR Code" />
      <p>Status: ${connectionStatus}</p>
      <script>setTimeout(()=>location.reload(), 5000)</script>
      </body></html>`);
  }
  res.send(`<html><body style="font-family:sans-serif;text-align:center">
    <h2>Status: ${connectionStatus}</h2>
    <script>setTimeout(()=>location.reload(), 5000)</script>
    </body></html>`);
});

app.listen(PORT, () => logger.info(`HTTP server ouvindo na porta ${PORT}`));

// --- WhatsApp connection -------------------------------------------------
async function startSock() {
  const { state, saveCreds } = await useSupabaseAuthState(supabase);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Daniel Agent', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQR = qr;
      connectionStatus = 'qr';
      logger.info('Novo QR Code gerado. Acesse a URL do serviço para escanear.');
    }

    if (connection === 'open') {
      latestQR = null;
      connectionStatus = 'open';
      logger.info('WhatsApp conectado!');
    }

    if (connection === 'close') {
      connectionStatus = 'closed';
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode }, 'Conexão fechada');
      if (shouldReconnect) {
        setTimeout(startSock, 3000);
      } else {
        logger.error('Sessão deslogada do WhatsApp. Escaneie o QR Code novamente.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        logger.error(err, 'Erro ao processar mensagem');
      }
    }
  });

  return sock;
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;

  const jid = msg.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;
  if (jid.endsWith('@g.us') && process.env.ALLOW_GROUPS !== 'true') return;

  const senderNumber = jid.split('@')[0];
  if (allowList.length && !allowList.includes(senderNumber)) {
    logger.info({ senderNumber }, 'Remetente fora da allowlist, ignorando');
    return;
  }

  let text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    null;

  const audioMsg = msg.message.audioMessage;
  if (!text && audioMsg) {
    text = await handleAudio(sock, msg);
    if (!text) {
      await sock.sendMessage(jid, {
        text: 'Recebi seu áudio, mas a transcrição não está configurada (defina OPENAI_API_KEY).',
      });
      return;
    }
  }

  if (!text) return;

  await sock.sendPresenceUpdate('composing', jid);

  const history = await getHistory(supabase, jid);
  await logMessage(supabase, { jid, role: 'user', content: text });

  const reply = await askClaude({ history, userMessage: text });

  await logMessage(supabase, { jid, role: 'assistant', content: reply });
  await sock.sendMessage(jid, { text: reply });
}

async function handleAudio(sock, msg) {
  const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
    logger,
    reuploadRequest: sock.updateMediaMessage,
  });
  const tmpFile = path.join(os.tmpdir(), `${msg.key.id}.ogg`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    return await transcribeAudio(tmpFile);
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

startSock().catch((err) => {
  logger.error(err, 'Falha ao iniciar o agente');
  process.exit(1);
});
