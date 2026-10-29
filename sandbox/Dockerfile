FROM docker.io/library/node:22-bookworm-slim
WORKDIR /base
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-fund --no-audit
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY web ./web
COPY tests ./tests
COPY skills ./skills
COPY scripts/evaluate.mjs ./evaluate.mjs
ENV ALIEN_EVALUATING=1
ENTRYPOINT ["node", "/base/evaluate.mjs"]
