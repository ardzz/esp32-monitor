# Frontend: React + Vite + Tailwind (static served by nginx)
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache nodejs npm
# Copy manifests first (better layer caching). lockfile is optional.
COPY package.json ./
COPY package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest and build
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
