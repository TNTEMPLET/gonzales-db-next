FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

ENV GC_WRITER_PORT=8105
ENV GC_WRITER_STORAGE_DIR=/data/gamechanger-writer
ENV GC_WRITER_HEADLESS=true
ENV TZ=America/Chicago

EXPOSE 8105

CMD ["node", "dist/index.js"]
