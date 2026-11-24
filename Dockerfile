FROM node:20.20.2-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

RUN mkdir -p data uploads && chown -R node:node data uploads
USER node

EXPOSE 3000
VOLUME ["/app/data", "/app/uploads"]

CMD ["node", "src/server.js"]
