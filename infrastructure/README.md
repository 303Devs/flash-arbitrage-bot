# Infrastructure Configuration

Docker container configurations for the Flash Arbitrage Bot infrastructure services.

## 🐳 **Docker-First Architecture**

All services are containerized and managed through Docker Compose. No standalone scripts needed.

## 📁 **Directory Structure**

```
infrastructure/
├── postgres/                    # PostgreSQL configuration files
│   ├── postgresql.conf         # Performance-tuned settings
│   ├── pg_hba.conf            # Authentication configuration  
│   └── init-postgres.sql      # Database initialization script
└── README.md                   # This documentation
```

## 🗃️ **PostgreSQL Configuration**

### **Performance Optimization**
- **256MB shared buffers** - Optimized for trading workloads
- **WAL compression** - Reduced disk I/O for high write volumes
- **Connection pooling** - Efficient resource utilization
- **Query optimization** - Tuned for time-series data patterns

### **Security Configuration**
- **scram-sha-256 authentication** - Modern password hashing
- **Docker network isolation** - Services communicate via private network
- **Role-based access control** - Separate users for bot, Grafana, monitoring

### **Database Setup**
The initialization script creates:
- `flash_arbitrage_bot` database → `flash_arbitrage_user`
- `grafana_db` database → `grafana_user`  
- `postgres_exporter` user for monitoring

## 🚀 **Usage**

All infrastructure management is handled via Docker Compose from the project root:

```bash
# Start all services
docker-compose up -d

# View service status
docker-compose ps

# Restart specific service
docker-compose restart postgres

# View logs
docker-compose logs postgres
```

## ⚙️ **Configuration Changes**

After modifying any configuration file:

1. **Restart the service** to apply changes:
   ```bash
   docker-compose restart postgres
   ```

2. **Verify changes** are applied:
   ```bash
   docker-compose logs postgres
   ```

## 🔐 **Security Features**

- **Environment-driven authentication** - All passwords via .env
- **Network isolation** - Services communicate on private Docker network
- **Minimal permissions** - Each user has only required access
- **Connection limits** - Prevent resource exhaustion

## 📊 **Data Persistence**

PostgreSQL data persists in Docker volume `postgres_data`, ensuring:
- **Data survives container restarts**
- **Automatic backups** via Docker volume snapshots
- **Performance optimization** with volume-specific settings

## 🔧 **Advanced Configuration**

### **Performance Tuning**
Modify `postgresql.conf` for your hardware:
- `shared_buffers` - 25% of available RAM
- `effective_cache_size` - 75% of available RAM
- `work_mem` - Based on concurrent connections

### **Monitoring Integration**
The `postgres_exporter` user provides metrics to Prometheus:
- Connection statistics
- Query performance
- Database size and growth
- Transaction rates

See `../monitoring/README.md` for dashboard configuration.

## 📝 **Notes**

- Configuration follows the project's **Critical Principles**
- All settings are **environment-driven** via .env file
- **Production-ready** security and performance settings
- **Docker-first** approach eliminates local setup complexity
