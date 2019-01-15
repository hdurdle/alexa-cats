FROM node:10-alpine

WORKDIR /app

RUN apk --no-cache add tar curl && \
  curl -L https://github.com/hdurdle/alexa-cats/archive/master.tar.gz | tar xz --strip-components=1 -C /app && \
  npm install --production && \
  rm -rf /tmp/* /root/.npm

WORKDIR /app/apps/catflap

RUN npm install --production && \
  rm -rf /tmp/* /root/.npm

WORKDIR /app

EXPOSE 8080

USER node

HEALTHCHECK --interval=1m --timeout=2s \
  CMD curl -LSs http://localhost:8080/alexa/catflap?schema || exit 1

CMD ["node", "server.js"]
