FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# install deps first so they cache between code changes
COPY package*.json ./
COPY stubs ./stubs
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

EXPOSE 8080

USER node

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "server.js"]
