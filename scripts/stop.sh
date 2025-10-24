#!/bin/bash
# RezNet AI - Stop Script

GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo "🛑 Stopping RezNet AI..."
echo ""

# Stop running processes
if [ -d ".runtime" ]; then
    for pidfile in .runtime/*.pid; do
        if [ -f "$pidfile" ]; then
            PID=$(cat "$pidfile")
            if ps -p $PID > /dev/null 2>&1; then
                kill $PID 2>/dev/null || true
                echo "   Stopped process: $PID"
            fi
            rm "$pidfile"
        fi
    done
    rmdir .runtime 2>/dev/null || true
fi

# Stop Docker services
echo "   Stopping Docker services..."
docker-compose down

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"
echo ""
