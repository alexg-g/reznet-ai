#!/bin/bash
# Run Performance Tests for RezNet AI - Issue #47
#
# This script runs all performance tests and generates a report.
#
# Usage:
#   ./backend/tests/run_performance_tests.sh
#
# Options:
#   --quick     Run only fast tests (skip LLM tests)
#   --full      Run all tests including LLM and load tests
#   --load      Run only load tests
#   --coverage  Run with coverage report

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
cd "$BACKEND_DIR"

echo "========================================"
echo "RezNet AI Performance Test Suite"
echo "========================================"
echo ""

# Activate virtual environment if exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Parse arguments
MODE="standard"
COVERAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            MODE="quick"
            shift
            ;;
        --full)
            MODE="full"
            shift
            ;;
        --load)
            MODE="load"
            shift
            ;;
        --coverage)
            COVERAGE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if Redis is running
echo "Checking Redis connection..."
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is running${NC}"
else
    echo -e "${RED}✗ Redis is not running. Start it with: docker-compose up -d redis${NC}"
    exit 1
fi

# Check if backend is running (for load tests)
if [ "$MODE" == "load" ] || [ "$MODE" == "full" ]; then
    echo "Checking backend server..."
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend server is running${NC}"
    else
        echo -e "${YELLOW}⚠ Backend server not running. Load tests will be skipped.${NC}"
        if [ "$MODE" == "load" ]; then
            echo "Start backend with: cd backend && uvicorn main:app --reload"
            exit 1
        fi
    fi
fi

echo ""
echo "========================================"
echo "Running Performance Tests"
echo "========================================"
echo ""

# Build pytest command
PYTEST_CMD="python3 -m pytest tests/test_performance.py -v --tb=short"

if [ "$COVERAGE" == true ]; then
    PYTEST_CMD="$PYTEST_CMD --cov=. --cov-report=html --cov-report=term"
fi

# Run tests based on mode
case $MODE in
    quick)
        echo "Running quick performance tests (cache and API only)..."
        $PYTEST_CMD -m performance -k "cache or endpoint"
        ;;
    full)
        echo "Running all performance tests..."
        $PYTEST_CMD -m performance
        echo ""
        echo "Running load tests..."
        python3 tests/load_test.py --users 50 --duration 30
        ;;
    load)
        echo "Running load tests..."
        python3 tests/load_test.py --users 50 --duration 60
        echo ""
        echo "Running stress test..."
        python3 tests/load_test.py --stress
        ;;
    *)
        echo "Running standard performance tests..."
        $PYTEST_CMD -m performance
        ;;
esac

echo ""
echo "========================================"
echo "Test Execution Complete"
echo "========================================"
echo ""

if [ "$COVERAGE" == true ]; then
    echo -e "${GREEN}Coverage report generated at: htmlcov/index.html${NC}"
fi

echo ""
echo "Next steps:"
echo "1. Review test results above"
echo "2. Update backend/tests/PERFORMANCE_TEST_RESULTS.md with actual metrics"
echo "3. Compare results against NFR targets in meta-dev/NFR.md"
echo "4. Investigate any failing tests"
echo ""
