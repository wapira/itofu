FROM node:24-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
EXPOSE 5173
# Rebuild after frontend source or dependency changes.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
