#!/bin/bash
# RezNet AI - Reset Script
# Resets local database and clears data

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${RED}⚠️  WARNING: This will delete all local data!${NC}"
echo ""
echo "This will:"
echo "  - Stop all services"
echo "  - Remove Docker volumes (database + cache)"
echo "  - Clear all data directories"
echo ""
read -p "Are you sure you want to continue? (yes/NO): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Reset cancelled."
    exit 0
fi

echo ""
echo "🗑️  Resetting RezNet AI..."

# Stop services
./scripts/stop.sh

# Remove Docker volumes
echo ""
echo "Removing Docker volumes..."
docker-compose down -v

# Clear data directories
echo "Clearing data directories..."
rm -rf data/postgres/*
rm -rf data/redis/*
rm -rf data/workspaces/*
rm -rf data/uploads/*
rm -rf data/agent-memory/*

# Clear logs
rm -rf logs/*

echo ""
echo -e "${GREEN}✅ Reset complete!${NC}"
echo ""
echo "Run ./scripts/setup.sh to reinitialize"
echo ""
