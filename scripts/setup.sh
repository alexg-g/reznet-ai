#!/bin/bash
# RezNet AI - Setup Script
# Local Development Setup

set -e  # Exit on error

echo "🚀 Setting up RezNet AI Local MVP..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v docker >/dev/null 2>&1 || {
    echo -e "${RED}❌ Docker not installed${NC}"
    echo "Install from: https://www.docker.com/products/docker-desktop"
    exit 1
}
echo -e "${GREEN}✓${NC} Docker installed"

command -v node >/dev/null 2>&1 || {
    echo -e "${RED}❌ Node.js not installed${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
}
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required (found v$(node --version))${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node --version) installed"

command -v npm >/dev/null 2>&1 || {
    echo -e "${RED}❌ npm not installed${NC}"
    exit 1
}
echo -e "${GREEN}✓${NC} npm installed"

echo ""

# Check if .env exists and has API keys
if [ -f ".env" ]; then
    echo "📝 Checking .env configuration..."

    if grep -q "ANTHROPIC_API_KEY=$" .env || ! grep -q "ANTHROPIC_API_KEY=" .env; then
        echo -e "${YELLOW}⚠️  ANTHROPIC_API_KEY not set in .env${NC}"
        echo "Please add your Anthropic API key to .env file"
        echo ""
        read -p "Enter your Anthropic API key (or press Enter to skip): " ANTHROPIC_KEY
        if [ ! -z "$ANTHROPIC_KEY" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$ANTHROPIC_KEY/" .env
            else
                sed -i "s/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$ANTHROPIC_KEY/" .env
            fi
            echo -e "${GREEN}✓${NC} Anthropic API key added"
        fi
    else
        echo -e "${GREEN}✓${NC} Anthropic API key configured"
    fi

    # Optional: GitHub token
    if grep -q "MCP_GITHUB_TOKEN=$" .env || ! grep -q "MCP_GITHUB_TOKEN=" .env; then
        echo -e "${YELLOW}⚠️  MCP_GITHUB_TOKEN not set (optional)${NC}"
        read -p "Enter your GitHub token (or press Enter to skip): " GITHUB_TOKEN
        if [ ! -z "$GITHUB_TOKEN" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/MCP_GITHUB_TOKEN=.*/MCP_GITHUB_TOKEN=$GITHUB_TOKEN/" .env
            else
                sed -i "s/MCP_GITHUB_TOKEN=.*/MCP_GITHUB_TOKEN=$GITHUB_TOKEN/" .env
            fi
            echo -e "${GREEN}✓${NC} GitHub token added"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  No .env file found. Copying from .env.example...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓${NC} .env created from .env.example"
        echo -e "${YELLOW}   Please edit .env and add your API keys${NC}"
    else
        echo -e "${RED}❌ No .env.example found${NC}"
        exit 1
    fi
fi

echo ""

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/{postgres,redis,workspaces,uploads,agent-memory}
echo -e "${GREEN}✓${NC} Data directories created"

# Start Docker services
echo ""
echo "🐳 Starting Docker services (PostgreSQL + Redis)..."
docker-compose up -d postgres redis

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if postgres is ready
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "   Still waiting for PostgreSQL..."
    sleep 2
done
echo -e "${GREEN}✓${NC} PostgreSQL is ready"

# Install TypeScript backend dependencies
echo ""
echo "📦 Setting up TypeScript backend..."
cd backend-ts
npm install
echo -e "${GREEN}✓${NC} Backend dependencies installed"
cd ..

# Install MCP server dependencies
echo ""
echo "📦 Setting up MCP servers..."

# Filesystem server
echo "   Installing filesystem MCP server..."
cd mcp-servers/filesystem
npm install --silent
cd ../..
echo -e "${GREEN}✓${NC} Filesystem MCP server ready"

# GitHub server
echo "   Installing GitHub MCP server..."
cd mcp-servers/github
npm install --silent
cd ../..
echo -e "${GREEN}✓${NC} GitHub MCP server ready"

# Setup frontend (Next.js)
echo ""
echo "⚛️  Setting up Next.js frontend..."

if [ -f "frontend/package.json" ]; then
    echo "   Frontend already initialized, installing dependencies..."
    cd frontend
    npm install
    cd ..
    echo -e "${GREEN}✓${NC} Frontend ready"
else
    echo -e "${YELLOW}Note: Frontend needs to be initialized with create-next-app${NC}"
    echo ""
    echo "Run the following command to set up the frontend:"
    echo -e "${GREEN}npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir${NC}"
    echo ""
    read -p "Would you like to set up the frontend now? (y/N): " setup_frontend

    if [[ $setup_frontend =~ ^[Yy]$ ]]; then
        echo "   Initializing Next.js frontend..."
        npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*"

        echo "   Installing additional frontend dependencies..."
        cd frontend
        npm install socket.io-client zustand lucide-react date-fns
        cd ..

        echo -e "${GREEN}✓${NC} Frontend ready"
    else
        echo -e "${YELLOW}⚠️  Skipping frontend setup${NC}"
        echo "You can set it up later by running:"
        echo "  cd frontend && npm install"
    fi
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "🎉 RezNet AI is ready to run!"
echo ""
echo "To start all services, run:"
echo -e "  ${GREEN}./scripts/start.sh${NC}"
echo ""
echo "Or start services individually:"
echo "  Backend:    cd backend-ts && npm run dev"
echo "  Frontend:   cd frontend && npm run dev"
echo "  MCP (FS):   cd mcp-servers/filesystem && npm start"
echo "  MCP (GH):   cd mcp-servers/github && npm start"
echo ""
echo "Access the application:"
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo "  Health:     http://localhost:8000/health"
echo ""
echo "Need help? Check README.md or run: ./scripts/start.sh"
echo ""
