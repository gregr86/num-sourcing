# Étape 1 : Build
FROM oven/bun:1.1 as builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
# On build le frontend
RUN bun run build

# Étape 2 : Serveur Web (Nginx)
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]