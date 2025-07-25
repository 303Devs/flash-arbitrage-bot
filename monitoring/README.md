# Monitoring Stack

Comprehensive observability infrastructure for the Flash Arbitrage Bot using Prometheus and Grafana.

## 🎯 **Overview**

Production-ready monitoring stack providing:
- **Real-time metrics collection** via Prometheus
- **Visual dashboards** via Grafana
- **Automated alerting** for critical issues
- **Performance analytics** for trading optimization

## 📊 **Architecture**

```
Monitoring Stack/
├── prometheus.yml              # Metrics collection configuration
├── alert_rules.yml            # Alerting rules for critical events
└── grafana/
    ├── grafana.ini            # Grafana server configuration
    ├── provisioning/          # Automatic dashboard/datasource setup
    │   ├── datasources/       # Prometheus connection config
    │   └── dashboards/        # Dashboard provisioning
    └── dashboards/            # Pre-built trading dashboards
        ├── trading/           # Trading performance dashboards
        ├── infrastructure/    # System health dashboards
        └── chains/           # Chain-specific analysis
```

## 🔍 **Data Sources**

### **Application Metrics**
- **Flash Arbitrage Bot** (port 3001) - Trading performance, opportunities, profits
- **PostgreSQL** (port 9187) - Database performance, connection stats
- **Redis** (port 9121) - Cache hit rates, memory usage, connections

### **Infrastructure Metrics**
- **Prometheus** (port 9090) - Self-monitoring of metrics collection
- **System Resources** - CPU, memory, disk usage (future: node-exporter)

## 📈 **Pre-built Dashboards**

### **Trading Performance Dashboard**
- **Profit Tracking** - Real-time P&L, daily/weekly summaries
- **Execution Metrics** - Success rates, latency, gas optimization
- **Opportunity Analysis** - Detection rates, rejection reasons
- **Chain Comparison** - Performance across Arbitrum, Polygon, Base

### **System Health Dashboard**
- **Service Status** - Up/down status for all critical services
- **Resource Utilization** - CPU, memory, network usage
- **Database Performance** - Query speeds, connection pools
- **Cache Performance** - Redis hit rates, memory usage

### **Chain Analysis Dashboard**
- **Gas Optimization** - Cost tracking per chain
- **DEX Performance** - Volume and success rates per DEX
- **Token Pair Analysis** - Most profitable trading pairs
- **Network Health** - RPC latency, block confirmation times

## 🚨 **Alert Rules**

### **Critical Alerts** (Immediate Response)
- **Bot Down** - Trading bot unreachable for >1 minute
- **Database Down** - PostgreSQL or Redis unavailable for >2 minutes
- **Wallet Critical** - Gas balance below minimum threshold
- **High Memory Usage** - Bot using >4GB memory for >2 minutes

### **Warning Alerts** (Monitor & Investigate)
- **No Recent Trades** - No executions in 15+ minutes
- **High Error Rate** - >10% error rate for 3+ minutes
- **Resource Usage** - High CPU/memory for 5+ minutes
- **Low Wallet Balance** - Gas approaching minimum levels

### **Infrastructure Alerts**
- **Disk Space Low** - <10% free space remaining
- **High System Load** - Load average >2.0 for 10+ minutes
- **Memory Pressure** - >90% system memory usage

## 🔧 **Configuration**

### **Environment-Driven Setup**
All monitoring configuration is driven by environment variables:
- **Scrape intervals** - Configurable per service type
- **Retention policies** - Data storage duration and size limits
- **Alert thresholds** - Customizable warning and critical levels

### **Prometheus Configuration**
```yaml
# High-frequency trading data
flash-arbitrage-bot: 5s intervals
# Infrastructure monitoring  
redis/postgres: 30s intervals
# Self-monitoring
prometheus: 30s intervals
```

### **Data Retention**
- **Short-term**: 30 days high-resolution data
- **Long-term**: PostgreSQL for historical analysis
- **Disk usage**: 50GB maximum with automatic cleanup

## 🚀 **Quick Start**

### **Access Dashboards**
1. **Start monitoring stack**: `docker-compose up -d`
2. **Open Grafana**: http://localhost:3000
3. **Login**: admin / secure_trading_bot_2025
4. **Navigate to dashboards**: Pre-loaded in folders

### **View Metrics**
- **Prometheus UI**: http://localhost:9090
- **Raw metrics**: http://localhost:3001/metrics (bot)
- **Service health**: Check "Up" status in Prometheus targets

### **Set Up Alerts**
1. **Configure alertmanager** (optional) for notifications
2. **Customize thresholds** in alert_rules.yml
3. **Test alerts** using Prometheus UI

## 📊 **Metrics Reference**

### **Trading Metrics**
- `arbitrage_opportunities_total` - Opportunities detected
- `arbitrage_trades_total` - Trades executed
- `arbitrage_profit_total` - Cumulative profit in USD
- `arbitrage_gas_used_total` - Total gas consumed
- `arbitrage_errors_total` - Trading errors encountered

### **Performance Metrics**
- `arbitrage_execution_duration_seconds` - Trade execution latency
- `arbitrage_opportunity_age_seconds` - Time from detection to execution
- `wallet_balance_eth` - Gas balance per chain
- `rpc_request_duration_seconds` - RPC provider latency

### **System Metrics**
- `redis_connected_clients` - Active Redis connections
- `pg_up` - PostgreSQL availability
- `pg_stat_activity_count` - Database connections
- `process_resident_memory_bytes` - Bot memory usage

## 🔧 **Customization**

### **Adding Custom Dashboards**
1. **Create JSON** dashboard in Grafana UI
2. **Export to file** in appropriate dashboards/ subfolder
3. **Restart Grafana** to auto-load: `docker-compose restart grafana`

### **Modifying Alerts**
1. **Edit alert_rules.yml** with new thresholds
2. **Validate syntax**: `docker-compose exec prometheus promtool check rules /etc/prometheus/alert_rules.yml`
3. **Reload config**: `docker-compose restart prometheus`

### **Performance Tuning**
- **Increase scrape frequency** for critical metrics
- **Reduce retention** to save disk space
- **Add recording rules** for complex queries

## 🛡️ **Security**

- **Grafana authentication** - Admin credentials via environment
- **Network isolation** - Services communicate on private Docker network
- **No external exposure** - Monitoring ports only accessible locally
- **Secret management** - All credentials via .env file

## 📝 **Troubleshooting**

### **Common Issues**
- **Missing metrics**: Check Prometheus targets page for scrape errors
- **Dashboard not loading**: Verify datasource connection in Grafana
- **High disk usage**: Reduce retention time or increase cleanup frequency

### **Debug Commands**
```bash
# Check service status
docker-compose ps

# View Prometheus targets
curl http://localhost:9090/api/v1/targets

# Test metrics endpoint
curl http://localhost:3001/metrics

# View service logs
docker-compose logs prometheus grafana
```

## 🔗 **Integration**

### **External Alerting**
- **Slack notifications** via webhook (configure alertmanager)
- **Email alerts** for critical issues
- **PagerDuty integration** for production deployments

### **Data Export**
- **Prometheus remote write** for external storage
- **Grafana annotations** for trade event marking
- **CSV export** of performance data

---

**Monitor everything, optimize constantly** 📊⚡
