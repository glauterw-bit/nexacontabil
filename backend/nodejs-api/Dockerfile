FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
EXPOSE 3001
ENV NODE_ENV=production
CMD ["sh", "-c", "echo '[start] checking dist…'; ls -la dist/ | head -5; echo '[start] db push…'; npx prisma db push 2>&1; echo '[start] db push exit='$?; echo '[start] launching node dist/main.js'; node dist/main.js; echo '[start] node exited with '$?"]
