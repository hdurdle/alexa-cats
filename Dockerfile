FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# install deps first so they cache between code changes
COPY package*.json ./
COPY apps/catflap/package*.json apps/catflap/
RUN npm ci --omit=dev && \
  cd apps/catflap && npm ci --omit=dev && \
  npm cache clean --force

COPY . .

EXPOSE 8080

USER node

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD node apps/catflap/healthcheck.js

CMD ["node", "server.js"]
