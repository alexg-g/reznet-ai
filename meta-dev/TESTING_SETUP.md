# Testing Infrastructure Setup

> **Purpose**: Installation instructions for testing dependencies needed by Tron-QA agent
> **Status**: MVP has minimal testing - Phase 2 requires full test infrastructure
> **Owner**: Tron-QA, Flynn-Dev

---

## Current State

**Backend** ✅ Partially Set Up:
- `pytest==8.4.2` - Installed
- `pytest-asyncio==1.2.0` - Installed
- `backend/tests/` directory exists with one test file

**Frontend** ❌ Not Set Up:
- No testing framework installed
- No test directory

**E2E** ❌ Not Set Up:
- No E2E framework installed
- No E2E test directory

---

## Required Dependencies

### Backend Testing

**Add to `backend/requirements.txt`**:
```txt
# Testing (add these)
pytest>=8.4.0
pytest-asyncio>=1.2.0
pytest-cov>=4.1.0          # Coverage reporting
pytest-mock>=3.12.0        # Mocking utilities
httpx>=0.27.0              # Already installed, used for testing FastAPI

# Code quality (add these)
ruff>=0.2.0                # Already installed, linting
mypy>=1.8.0                # Already installed, type checking
bandit>=1.7.0              # Security scanning
```

**Installation**:
```bash
cd backend
source venv/bin/activate
pip install pytest-cov pytest-mock bandit
```

### Frontend Testing

**Add to `frontend/package.json` devDependencies**:
```json
{
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "@testing-library/user-event": "^14.5.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "@types/jest": "^29.5.0"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

**Installation**:
```bash
cd frontend
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom @types/jest
```

**Create `frontend/jest.config.js`**:
```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{js,jsx,ts,tsx}',
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
}

module.exports = createJestConfig(customJestConfig)
```

**Create `frontend/jest.setup.js`**:
```javascript
import '@testing-library/jest-dom'
```

### E2E Testing (Playwright)

**Installation**:
```bash
# At repo root
npm init playwright@latest

# Or install manually
npm install --save-dev @playwright/test
npx playwright install
```

**This creates**:
- `playwright.config.ts` - Configuration
- `tests/` or `e2e/` - Test directory
- Installs browser binaries (Chromium, Firefox, WebKit)

**Playwright Configuration** (`playwright.config.ts`):
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Directory Structure (After Setup)

```
reznet-ai/
├── backend/
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_agents.py          # Agent API tests (to create)
│   │   ├── test_workflows.py       # Workflow tests (to create)
│   │   └── test_mcp_integration.py # Existing
│   └── requirements.txt             # Add pytest-cov, pytest-mock, bandit
│
├── frontend/
│   ├── __tests__/                   # Create this
│   │   ├── components/
│   │   │   └── AgentCreationModal.test.tsx
│   │   └── lib/
│   │       └── api.test.ts
│   ├── jest.config.js               # Create this
│   ├── jest.setup.js                # Create this
│   └── package.json                 # Add testing dependencies
│
├── tests/                           # Create this (or e2e/)
│   └── e2e/
│       ├── custom-agent-creation.spec.ts
│       ├── agent-invocation.spec.ts
│       └── workflow-execution.spec.ts
│
└── playwright.config.ts             # Create this
```

---

## Testing Commands

### Backend Tests
```bash
cd backend
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_agents.py -v

# Run single test
pytest tests/test_agents.py::test_create_agent_success -v

# Security scan
bandit -r . -ll
```

### Frontend Tests
```bash
cd frontend

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific test file
npm test -- AgentCreationModal.test.tsx
```

### E2E Tests
```bash
# Run all E2E tests
npx playwright test

# Run specific browser
npx playwright test --project=chromium

# Run specific test
npx playwright test tests/e2e/custom-agent-creation.spec.ts

# Run with UI
npx playwright test --ui

# Generate report
npx playwright show-report
```

---

## Setup Order (Recommended)

When Tron-QA starts writing tests:

1. **Backend Testing First** (easiest):
   ```bash
   cd backend
   pip install pytest-cov pytest-mock bandit
   # Create tests/test_agents.py
   pytest tests/test_agents.py -v
   ```

2. **Frontend Testing Second**:
   ```bash
   cd frontend
   npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom @types/jest
   # Create jest.config.js and jest.setup.js
   # Create __tests__/ directory
   npm test
   ```

3. **E2E Testing Last** (requires backend + frontend running):
   ```bash
   npm init playwright@latest
   # Create tests/e2e/ directory
   npx playwright test
   ```

---

## CI/CD Integration

Once tests are set up, Flynn-Dev should update `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt

      - name: Run tests with coverage
        run: |
          cd backend
          pytest --cov=. --cov-report=xml --cov-report=html

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage.xml

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Run tests
        run: |
          cd frontend
          npm test -- --coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Coverage Targets (NFR.md)

**Backend**: > 80% code coverage
**Frontend**: > 70% code coverage
**Critical paths**: 100% coverage (auth, payments, data integrity)

---

## Notes for Tron-QA

- **Start simple**: Write basic tests first, then expand coverage
- **Backend tests are easiest**: pytest is already partially installed
- **Frontend needs setup**: Jest config required before writing tests
- **E2E comes last**: Requires both backend and frontend to be running
- **Don't install everything at once**: Install dependencies as you need them

---

*Last updated: 2025-10-29*
*Owner: Tron-QA, Flynn-Dev*
