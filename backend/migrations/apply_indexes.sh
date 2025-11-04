#!/bin/bash
# Apply database performance indexes migration
# Usage: ./backend/migrations/apply_indexes.sh

set -e

echo "Applying database performance indexes migration..."

# Default PostgreSQL connection from .env
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-reznet}"
DB_PASSWORD="${DB_PASSWORD:-reznet_password}"
DB_NAME="${DB_NAME:-reznet_ai}"

# Apply migration
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$(dirname $0)/add_performance_indexes.sql"

echo "Migration applied successfully!"
echo ""
echo "Indexes created:"
echo "  - Agent table: 4 indexes (name, type, active, type+active)"
echo "  - Message table: 4 indexes (channel_id, created_at, author_id, channel+created)"
echo "  - Workflow table: 4 indexes (status, created_at, channel_id, status+created)"
echo "  - WorkflowTask table: 4 indexes (workflow_id, status, order_index, workflow+status)"
echo ""
echo "Performance improvement expected:"
echo "  - Query response time: < 100ms (95th percentile)"
echo "  - Faster filtering by agent type/status"
echo "  - Faster message pagination in channels"
echo "  - Faster workflow status queries"
