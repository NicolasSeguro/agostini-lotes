FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV LIBREOFFICE_PATH=/usr/bin/soffice
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
