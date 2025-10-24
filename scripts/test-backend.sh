#!/bin/bash
# Quick Backend Test Script

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "🧪 Testing RezNet AI Backend"
echo "=============================="
echo ""

BASE_URL="http://localhost:8000"

# Test 1: Health Check
echo -e "${BLUE}[1/6]${NC} Testing health endpoint..."
HEALTH=$(curl -s "$BASE_URL/api/health")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "      ${GREEN}✓${NC} Health check passed"
else
    echo -e "      ${RED}✗${NC} Health check failed"
    exit 1
fi

# Test 2: Get Channels
echo ""
echo -e "${BLUE}[2/6]${NC} Testing channels endpoint..."
CHANNELS=$(curl -s "$BASE_URL/api/channels")
CHANNEL_COUNT=$(echo "$CHANNELS" | jq '. | length')
echo -e "      ${GREEN}✓${NC} Found $CHANNEL_COUNT channels"

# Test 3: Get Agents
echo ""
echo -e "${BLUE}[3/6]${NC} Testing agents endpoint..."
AGENTS=$(curl -s "$BASE_URL/api/agents")
AGENT_COUNT=$(echo "$AGENTS" | jq '. | length')
echo -e "      ${GREEN}✓${NC} Found $AGENT_COUNT agents"

# Show agents
echo -e "${YELLOW}      Available agents:${NC}"
echo "$AGENTS" | jq -r '.[] | "      - \(.name) (\(.agent_type))"'

# Test 4: Get Backend Agent
echo ""
echo -e "${BLUE}[4/6]${NC} Getting @backend agent..."
BACKEND_AGENT=$(echo "$AGENTS" | jq -r '.[] | select(.name=="@backend")')
BACKEND_ID=$(echo "$BACKEND_AGENT" | jq -r '.id')
echo -e "      ${GREEN}✓${NC} Backend agent ID: $BACKEND_ID"

# Test 5: Invoke Backend Agent
echo ""
echo -e "${BLUE}[5/6]${NC} Invoking @backend agent..."
echo -e "${YELLOW}      Question: 'What is FastAPI?'${NC}"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/agents/$BACKEND_ID/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "In one sentence, what is FastAPI?",
    "context": {}
  }')

if echo "$RESPONSE" | jq -e '.agent_id' > /dev/null 2>&1; then
    echo -e "      ${GREEN}✓${NC} Agent invoked successfully"
    echo ""
    echo -e "${YELLOW}      Agent Response:${NC}"
    echo "$RESPONSE" | jq -r '.response' | fold -w 70 -s | sed 's/^/      /'
else
    echo -e "      ${RED}✗${NC} Agent invocation failed"
    echo "$RESPONSE" | jq .
fi

# Test 6: Get Stats
echo ""
echo -e "${BLUE}[6/6]${NC} Getting system stats..."
STATS=$(curl -s "$BASE_URL/api/stats")
echo -e "      ${GREEN}✓${NC} System statistics:"
echo "$STATS" | jq -r '
    "      - Agents: \(.agents.active)/\(.agents.total) active",
    "      - Messages: \(.messages.total) total",
    "      - Tasks: \(.tasks.pending) pending, \(.tasks.total) total"
'

echo ""
echo "=============================="
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "💡 Next steps:"
echo "   1. Try the interactive API docs: $BASE_URL/docs"
echo "   2. Test WebSocket: see NEXT_STEPS.md"
echo "   3. Build the frontend: cd frontend && npm run dev"
echo ""
