# Katsumi WhatsApp Bot

## Overview
Katsumi is a modular WhatsApp bot built with Baileys library. It features a plugin system, multi-session support (CloneBot), and database abstraction (MongoDB/MySQL/Local JSON).

## Recent Changes (December 27, 2025)
- Added environment validation utility for startup checks
- Implemented structured logging with levels (debug/info/warn/error) and file output
- Added health monitoring system for bot and clone sessions
- Created metrics collection system for observability
- Improved graceful shutdown with proper cleanup handlers
- Updated PM2 config with log rotation and memory limits

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
│   │   └── models/   # Data models (user, group, session, settings)
│   ├── schema/       # Validation schemas
│   └── scrapers/     # Web scrapers
├── plugins/          # Bot commands organized by category
│   ├── _auto/        # Auto-run plugins
│   ├── ai/           # AI-related commands
│   ├── convert/      # Media conversion
│   ├── downloader/   # Social media downloaders
│   ├── group/        # Group management
│   ├── info/         # Information commands
│   ├── misc/         # Miscellaneous commands
│   ├── owner/        # Owner-only commands
│   └── tools/        # Utility tools
└── utils/            # General utilities
```

### Key Components
- **Connect** (`src/core/connect.js`): Main connection manager for WhatsApp
- **PluginManager** (`src/lib/plugins.js`): Handles plugin loading, execution, and lifecycle
- **Store** (`src/lib/store.js`): Session data storage (MongoDB or Local)
- **Health Monitor** (`src/lib/health.js`): Component health checks
- **Metrics Collector** (`src/lib/metrics.js`): Performance and usage metrics
- **Graceful Shutdown** (`src/lib/gracefulShutdown.js`): Clean shutdown handling

### Database Support
- MongoDB (preferred for CloneBot)
- MySQL (via mysql-baileys)
- Local JSON files (default fallback)

### Environment Variables
Required for MongoDB mode:
- `MONGO_URI` - MongoDB connection string
- `USE_MONGO=true` - Enable MongoDB

Required for authentication:
- `BOT_NUMBER` - Phone number for pairing code authentication
- `QR=true` - Use QR code authentication instead

Optional:
- `BOT_SESSION_NAME` - Session name (default: "sessions")
- `BOT_PREFIXES` - Command prefixes (default: "!")
- `OWNER_JIDS` - Owner phone numbers
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

## User Preferences
- Keep code modular with plugin-based architecture
- Follow existing ESLint/Prettier configuration
- Use tabs for indentation
