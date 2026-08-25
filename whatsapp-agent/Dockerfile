FROM node:20-slim

# ffmpeg is required by Baileys to transcode WhatsApp voice notes (ogg/opus)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
