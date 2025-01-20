#!/bin/bash
set -e # Any subsequent(*) commands which fail will cause the shell script to exit immediately
docker buildx create --use
timestamp=$(date +%Y%m%d.%H%M)
specificVersionTag=mercurr/interval-server:$timestamp
# Build the docker image + pushes it to registry
docker buildx build --output=type=registry --platform=linux/arm64 -t mercurr/interval-server:latest -t $specificVersionTag .