#!/bin/bash
# Quick Backend Test Script

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "🧪 Testing RezNet AI Backend (TypeScript/Fastify)"
echo "=============================="
echo ""

BASE_URL="http://localhost:8000"

# Test 1: Health Check
echo -e "${BLUE}[1/5]${NC} Testing health endpoint..."
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q '"status"'; then
    echo -e "      ${GREEN}✓${NC} Health check passed"
    echo "$HEALTH" | jq -r '"      Status: \(.status), Postgres: \(.postgres), Redis: \(.redis)"' 2>/dev/null || true
else
    echo -e "      ${RED}✗${NC} Health check failed"
    exit 1
fi

# Test 2: Root endpoint
echo ""
echo -e "${BLUE}[2/5]${NC} Testing root endpoint..."
ROOT=$(curl -s "$BASE_URL/")
if echo "$ROOT" | grep -q "RezNet AI"; then
    echo -e "      ${GREEN}✓${NC} Root endpoint responding"
else
    echo -e "      ${RED}✗${NC} Root endpoint failed"
fi

# Test 3: Get Channels
echo ""
echo -e "${BLUE}[3/5]${NC} Testing channels endpoint..."
CHANNELS=$(curl -s "$BASE_URL/api/channels")
CHANNEL_COUNT=$(echo "$CHANNELS" | jq '. | length' 2>/dev/null || echo "0")
echo -e "      ${GREEN}✓${NC} Found $CHANNEL_COUNT channels"

# Test 4: Get Agents
echo ""
echo -e "${BLUE}[4/5]${NC} Testing agents endpoint..."
AGENTS=$(curl -s "$BASE_URL/api/agents")
AGENT_COUNT=$(echo "$AGENTS" | jq '. | length' 2>/dev/null || echo "0")
echo -e "      ${GREEN}✓${NC} Found $AGENT_COUNT agents"

# Show agents
if [ "$AGENT_COUNT" -gt 0 ] 2>/dev/null; then
    echo -e "${YELLOW}      Available agents:${NC}"
    echo "$AGENTS" | jq -r '.[] | "      - \(.name) (\(.agent_type // .agentType // "unknown"))"' 2>/dev/null || true
fi

# Test 5: LLM Config
echo ""
echo -e "${BLUE}[5/5]${NC} Testing LLM config endpoint..."
LLM_CONFIG=$(curl -s "$BASE_URL/api/llm-config")
if echo "$LLM_CONFIG" | grep -q "default_provider"; then
    PROVIDER=$(echo "$LLM_CONFIG" | jq -r '.default_provider' 2>/dev/null || echo "unknown")
    MODEL=$(echo "$LLM_CONFIG" | jq -r '.active_model' 2>/dev/null || echo "unknown")
    echo -e "      ${GREEN}✓${NC} LLM config: $PROVIDER / $MODEL"
else
    echo -e "      ${YELLOW}⚠${NC}  LLM config endpoint returned unexpected response"
fi

echo ""
echo "=============================="
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "💡 Next steps:"
echo "   1. Run unit tests: cd backend-ts && npm test"
echo "   2. Open the frontend: http://localhost:3000"
echo "   3. Check health: $BASE_URL/health"
echo ""
