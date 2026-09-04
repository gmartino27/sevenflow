FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN addgroup -S sevenflow \
  && adduser -S sevenflow -G sevenflow \
  && mkdir -p /app/.sevenflow-data \
  && chown -R sevenflow:sevenflow /app

USER sevenflow

ENV HOST=0.0.0.0
ENV PORT=8000
ENV SEVENFLOW_LOCAL_AUTH=true
ENV SEVENFLOW_LOCAL_USER_EMAIL=admin@sevenflow.local
ENV SEVENFLOW_LOCAL_USER_PASSWORD=sevenflow
ENV SEVENFLOW_LOCAL_USER_ID=local-user
ENV SEVENFLOW_LOCAL_SESSION_SECRET=change-this-local-secret

EXPOSE 8000

CMD ["npm", "run", "start:local"]
