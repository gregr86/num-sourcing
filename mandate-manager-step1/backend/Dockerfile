
FROM oven/bun:1.1
WORKDIR /app

# Install dependencies
COPY package.json tsconfig.json ./
RUN bun install

# Prisma client
COPY prisma ./prisma
RUN bunx prisma generate

# Source
COPY src ./src

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "start"]
