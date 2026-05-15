FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Garante NEXT_PUBLIC_API_URL no build-time (variavel Railway → build arg)
ARG NEXT_PUBLIC_API_URL=https://backend-production-9eeec.up.railway.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Remove qualquer cache antigo do Next antes de buildar
RUN rm -rf .next && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
