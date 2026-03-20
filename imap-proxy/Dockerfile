FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production --ignore-scripts
COPY server.mjs ./
# config.json mounted at runtime via docker-compose volume
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 3001
CMD ["node", "server.mjs"]
