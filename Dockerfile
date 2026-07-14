# Build and run the Phone Monitor helper (which also serves the dashboard).
FROM node:20-alpine

WORKDIR /app

# Install workspace deps and build both web (dashboard) and helper.
COPY . .
RUN npm install && npm run build

ENV NODE_ENV=production
ENV MOCK=0
# Cloud platforms inject PORT; the helper reads process.env.PORT (defaults to 8787).
EXPOSE 8787

CMD ["npm", "start"]
