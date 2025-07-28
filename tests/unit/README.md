# 🔧 Unit Tests

Tests isolated component functionality with minimal dependencies.

## Structure
- `data/` - Data layer components (RPC, WebSocket, Health monitoring)
- `storage/` - Storage layer (Redis, PostgreSQL)
- `utils/` - Utility components (Logger, Helpers)
- `arbitrage/` - Trading logic (Phase 3)
- `execution/` - Execution layer (Phase 4)
- `flashloans/` - Flash loan providers (Phase 4)

## Principles
- Test pure business logic
- Minimal mocking
- Fast execution
- Isolated testing
