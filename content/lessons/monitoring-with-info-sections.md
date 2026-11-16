---
slug: monitoring-with-info-sections
title: Monitoring Redis with INFO Sections
topic: security-and-operations
kind: tool
summary: Extract vital health metrics, memory usage, hit rates, and replication status using targeted INFO command sections.
tags:
  - info
  - monitoring
  - metrics
  - observability
related:
  - memory-diagnostics-and-usage
  - identifying-slow-queries-slowlog
---
> **In one line:** The INFO command returns detailed real-time health, memory, connection, and operational statistics across the server.

## The idea
The `INFO` command is the primary observability tool for Redis. It reports internal operational metrics, performance statistics, and hardware resource utilization.

Calling plain `INFO` outputs several pages of data. To minimize overhead and focus diagnostics, pass specific section names to retrieve targeted subsystem metrics.

| Section Name | Primary Metrics Provided |
| :--- | :--- |
| `memory` | `used_memory`, `mem_fragmentation_ratio`, `maxmemory` |
| `stats` | `total_connections_received`, `keyspace_hits`, `keyspace_misses` |
| `clients` | `connected_clients`, `blocked_clients`, `maxclients` |
| `replication` | `role`, `connected_slaves`, `master_repl_offset` |
| `cpu` | `used_cpu_sys`, `used_cpu_user` |

## See it
Query specific metric sections with `redis-cli`:

```bash
# Query memory section to check cache sizing and fragmentation
127.0.0.1:6379> INFO memory
# Memory
used_memory:1073741824
used_memory_human:1.00G
used_memory_rss:1288490188
mem_fragmentation_ratio:1.20
maxmemory:2147483648
maxmemory_policy:allkeys-lru

# Query operational stats to calculate cache hit ratio
127.0.0.1:6379> INFO stats
# Stats
total_commands_processed:15234900
instantaneous_ops_per_sec:12500
keyspace_hits:8500000
keyspace_misses:1500000

# Query connected clients and blocked clients
127.0.0.1:6379> INFO clients
connected_clients:42
blocked_clients:0
```

## Go deeper
You can compute your cache hit ratio directly from `keyspace_hits` and `keyspace_misses`:

$$	ext{Hit Ratio} = rac{	ext{keyspace\_hits}}{	ext{keyspace\_hits} + 	ext{keyspace\_misses}} = rac{8,500,000}{10,000,000} = 85\%$$

A healthy cache should consistently maintain a hit ratio above 85–90%. A sudden drop in hit ratio indicates cache stampedes, TTL misconfigurations, or key eviction thrashing.

Operational monitoring should also track `blocked_clients`. A non-zero blocked clients count indicates active connections waiting on blocking list pops (`BLPOP`, `BRPOP`) or stream reads (`XREAD BLOCK`). Monitoring `used_cpu_sys` and `used_cpu_user` helps identify thread contention or background fork overhead during RDB snapshots and AOF rewrites.

Key memory health metrics to track continuously include:
* `used_memory_rss`: Resident Set Size allocated by the operating system kernel.
* `mem_fragmentation_ratio`: Ratio of RSS memory to allocated memory.
* `used_memory_peak`: Maximum RAM consumed since the server process started.

> **Tip:** You can query multiple sections simultaneously by passing multiple arguments: `INFO memory stats clients`.

## Watch out
* Polling `INFO` multiple times per second can introduce slight CPU overhead on high-load instances.
* Keep `mem_fragmentation_ratio` between 1.0 and 1.5; ratios above 1.5 indicate severe memory fragmentation.

## Remember
* `INFO <section>` retrieves targeted metrics for memory, clients, replication, and CPU.
* Calculate cache hit ratio using `keyspace_hits` and `keyspace_misses` from `INFO stats`.
* Use Prometheus or Datadog exporters to continuously graph and alert on `INFO` metrics.
