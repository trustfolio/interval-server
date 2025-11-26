FROM node:18.18.0-alpine AS builder

WORKDIR /app

# Accept VITE_ environment variables as build arguments
ARG HASURA_API_URL
ARG MARKETPLACE_URL

# Set them as environment variables for the build process
ENV VITE_HASURA_API_URL=${HASURA_API_URL}
ENV VITE_MARKETPLACE_URL=${MARKETPLACE_URL}

# Copy package files
COPY package.json yarn.lock ./

# Copy prisma schema first
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN yarn install --frozen-lockfile

# Copy the rest of the application
COPY . .

RUN yarn build

FROM node:18.18.0-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/email-templates ./email-templates
COPY --from=builder /app/public ./public

CMD [ "node", "dist/src/entry.js", "start" ]