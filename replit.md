# Katsumi WhatsApp Bot

## Overview
Katsumi is a modular WhatsApp bot built with Baileys library. It features a plugin system, multi-session support (CloneBot), and a hybrid database architecture (PostgreSQL + Redis).

## Recent Changes (December 27, 2025)
- Added environment validation utility for startup checks
- Implemented structured logging with levels (debug/info/warn/error) and file output
- Added health monitoring system for bot and clone sessions
- Created metrics collection system for observability
- Improved graceful shutdown with proper cleanup handlers
- Updated PM2 config with log rotation and memory limits
- **NEW: PostgreSQL + Redis hybrid database architecture**
- Fixed command prefix handling (only registered commands are processed)

## Database Architecture

### Hybrid Setup (PostgreSQL + Redis)
```
PostgreSQL (Persistent Storage)
├── users          - User profiles, bans, premium status
├── groups         - Group settings, welcome messages
├── commands       - Command usage analytics
├── ai_tasks       - AI task history and results
├── settings       - Bot configuration
└── sessions       - Clone session management

Redis (In-Memory Cache) - Optional via Upstash
├── cooldowns      - Command cooldown tracking
├── sessions       - Quick session lookups
├── rate_limits    - Rate limiting counters
└── job_states     - Real-time job tracking
```

### Database Priority
1. **PostgreSQL** (if `DATABASE_URL` is set) - Recommended
2. **MongoDB** (if `USE_MONGO=true`)
3. **Local JSON** (fallback)

## Project Architecture

### Directory Structure
```
src/
├── config/           # Configuration files
├── core/             # Core bot logic (Connect, Message handling)
├── lib/              # Utility libraries
│   ├── auth/         # Authentication (MongoDB, state management)
│   ├── clonebot/     # Multi-session support
│   ├── database/     # Database abstraction layer
│   │   ├── models/   # MongoDB models
│   │   ├── schema.js # PostgreSQL schema (Drizzle)
│   │   └── postgres.js # PostgreSQL models
│   ├── redis/        # Redis caching service
│   ├── schema/       # Validation schemas
│   └── scrapers/     # Web scrapers
├── plugins/          # Bot commands organized by category
└── utils/            # General utilities
```

### Key Components
- **Connect** (`src/core/connect.js`): Main connection manager for WhatsApp
- **PluginManager** (`src/lib/plugins.js`): Handles plugin loading, execution, and lifecycle
- **Store** (`src/lib/store.js`): Session data storage (MongoDB or Local)
- **Health Monitor** (`src/lib/health.js`): Component health checks
- **Metrics Collector** (`src/lib/metrics.js`): Performance and usage metrics
- **Graceful Shutdown** (`src/lib/gracefulShutdown.js`): Clean shutdown handling
- **Redis Service** (`src/lib/redis/index.js`): Caching, cooldowns, rate limiting

## Environment Variables

### Database (PostgreSQL - Recommended)
- `DATABASE_URL` - PostgreSQL connection string (auto-provided by Replit)

### Database (MongoDB - for CloneBot)
- `MONGO_URI` - MongoDB connection string
- `USE_MONGO=true` - Enable MongoDB for session auth

### Redis (Optional - Upstash)
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token

### Bot Configuration
- `BOT_NUMBER` - Phone number for pairing code authentication
- `QR=true` - Use QR code authentication instead
- `BOT_SESSION_NAME` - Session name (default: "sessions")
- `BOT_PREFIXES` - Command prefixes (default: "!")
- `OWNER_JIDS` - Owner phone numbers

### Logging
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARN, ERROR)
- `LOG_TO_FILE` - Enable file logging

## Running the Bot

### Development
```bash
node --env-file .env src/main.js
```

### Production (PM2)
```bash
pm2 start ecosystem.config.cjs
```

### Database Migrations
```bash
npx drizzle-kit push --force
```

## User Preferences
- Keep code modular with plugin-based architecture
- Follow existing ESLint/Prettier configuration
- Use tabs for indentation
- PostgreSQL + Redis for production deployments
