#!/bin/bash
# RezNet AI - Start Script
# Starts all services for local development

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create logs directory first (before starting any services)
mkdir -p logs
mkdir -p .runtime

echo ""
echo "🚀 Starting RezNet AI..."
echo ""

# Start Docker services
echo -e "${BLUE}[1/4]${NC} Starting Docker services (PostgreSQL + Redis)..."
docker-compose up -d postgres redis

# Wait for services
echo "      Waiting for services to be ready..."
sleep 3

until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    sleep 1
done
echo -e "      ${GREEN}✓${NC} Database ready"

# Start MCP Filesystem server
echo ""
echo -e "${BLUE}[2/4]${NC} Starting MCP Filesystem server..."
cd mcp-servers/filesystem
npm start > ../../logs/mcp-filesystem.log 2>&1 &
MCP_FS_PID=$!
cd ../..

# Wait for MCP Filesystem server to be ready
echo "      Waiting for MCP Filesystem server to be ready..."
sleep 2
RETRIES=10
for i in $(seq 1 $RETRIES); do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "      ${GREEN}✓${NC} MCP Filesystem server ready (PID: $MCP_FS_PID)"
        break
    fi
    if [ $i -eq $RETRIES ]; then
        echo -e "      ${YELLOW}⚠${NC}  MCP Filesystem server may not have started correctly. Check logs/mcp-filesystem.log"
    fi
    sleep 1
done

# Start MCP GitHub server (if token is configured)
echo ""
echo -e "${BLUE}[3/4]${NC} Starting MCP GitHub server..."
if grep -q "MCP_GITHUB_TOKEN=.\+" .env 2>/dev/null; then
    cd mcp-servers/github
    npm start > ../../logs/mcp-github.log 2>&1 &
    MCP_GH_PID=$!
    echo -e "      ${GREEN}✓${NC} MCP GitHub server started (PID: $MCP_GH_PID)"
    cd ../..
else
    echo -e "      ${YELLOW}⚠${NC}  Skipped (no GitHub token configured)"
fi

# Start Backend
echo ""
echo -e "${BLUE}[4/4]${NC} Starting FastAPI backend..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to be ready
echo "      Waiting for backend to start..."
sleep 3
RETRIES=10
for i in $(seq 1 $RETRIES); do
    if curl -s http://localhost:8000/health > /dev/null 2>&1 || curl -s http://localhost:8000 > /dev/null 2>&1; then
        echo -e "      ${GREEN}✓${NC} Backend server ready (PID: $BACKEND_PID)"
        break
    fi
    if [ $i -eq $RETRIES ]; then
        echo -e "      ${YELLOW}⚠${NC}  Backend may not have started correctly. Check logs/backend.log"
    fi
    sleep 1
done

# Start Frontend (if it exists)
echo ""
if [ -f "frontend/package.json" ]; then
    echo "⚛️  Starting Next.js frontend..."
    cd frontend
    npm run dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..

    # Wait for frontend to be ready
    echo "   Waiting for frontend to start..."
    sleep 3
    RETRIES=15
    for i in $(seq 1 $RETRIES); do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "   ${GREEN}✓${NC} Frontend server ready (PID: $FRONTEND_PID)"
            break
        fi
        if [ $i -eq $RETRIES ]; then
            echo -e "   ${YELLOW}⚠${NC}  Frontend may not have started correctly. Check logs/frontend.log"
        fi
        sleep 1
    done
else
    echo -e "${YELLOW}⚠️  Frontend not found. Run setup.sh first.${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ RezNet AI is running!${NC}"
echo "=========================================="
echo ""
echo "📱 Access your application:"
echo -e "   Frontend:  ${BLUE}http://localhost:3000${NC}"
echo -e "   Backend:   ${BLUE}http://localhost:8000${NC}"
echo -e "   API Docs:  ${BLUE}http://localhost:8000/docs${NC}"
echo ""
echo "🔧 Services:"
echo "   PostgreSQL: localhost:5432"
echo "   Redis:      localhost:6379"
echo "   MCP (FS):   localhost:3001"
if [ ! -z "$MCP_GH_PID" ]; then
    echo "   MCP (GH):   localhost:3002"
fi
echo ""
echo "📋 Process IDs:"
echo "   Backend:    $BACKEND_PID"
if [ ! -z "$FRONTEND_PID" ]; then
    echo "   Frontend:   $FRONTEND_PID"
fi
echo "   MCP (FS):   $MCP_FS_PID"
if [ ! -z "$MCP_GH_PID" ]; then
    echo "   MCP (GH):   $MCP_GH_PID"
fi
echo ""
echo "📝 Logs are in ./logs/"
echo ""
echo "To stop all services:"
echo -e "   ${YELLOW}./scripts/stop.sh${NC}"
echo "   or press Ctrl+C and run: docker-compose down"
echo ""

# Save PIDs for stop script
echo "$BACKEND_PID" > .runtime/backend.pid
echo "$MCP_FS_PID" > .runtime/mcp-fs.pid
if [ ! -z "$FRONTEND_PID" ]; then
    echo "$FRONTEND_PID" > .runtime/frontend.pid
fi
if [ ! -z "$MCP_GH_PID" ]; then
    echo "$MCP_GH_PID" > .runtime/mcp-gh.pid
fi

# Keep script running and show logs
echo "Streaming logs (Ctrl+C to stop watching, services will continue)..."
echo ""
tail -f logs/*.log 2>/dev/null || echo "Waiting for logs..."
