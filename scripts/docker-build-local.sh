#!/bin/bash
set -e # Any subsequent(*) commands which fail will cause the shell script to exit immediately

# Load environment variables from .env.production or .env
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
elif [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
fi

# Build the docker image locally
docker buildx build --platform=linux/arm64 -t trustfolio/interval-server:local . \
  --build-arg PRISMA_SCHEMA_PATH=./prisma/schema.prisma \
  --build-arg HASURA_API_URL=${HASURA_API_URL} \
  --build-arg MARKETPLACE_URL=${MARKETPLACE_URL} \
  --load

