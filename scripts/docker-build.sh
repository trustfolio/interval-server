#!/bin/bash
set -e # Any subsequent(*) commands which fail will cause the shell script to exit immediately

# Load environment variables from .env.production or .env
if [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
elif [ -f .env ]; then
  set -a
  source .env
  set +a
fi

docker buildx create --use
timestamp=$(date +%Y%m%d.%H%M)
specificVersionTag=mercurr/interval-server:$timestamp
# Build the docker image + pushes it to registry
docker buildx build --output=type=registry --platform=linux/arm64 -t mercurr/interval-server:latest -t $specificVersionTag . --build-arg PRISMA_SCHEMA_PATH=./prisma/schema.prisma --build-arg HASURA_API_URL=${HASURA_API_URL} --build-arg MARKETPLACE_URL=${MARKETPLACE_URL}