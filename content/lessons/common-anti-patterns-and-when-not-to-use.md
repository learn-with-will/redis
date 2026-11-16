---
slug: common-anti-patterns-and-when-not-to-use
title: Common Anti-Patterns and When Not to Use Redis
topic: security-and-operations
kind: pitfall
summary: "Avoid dangerous production mistakes: massive keys, unbounded scans, using Redis as an RDBMS, and ignoring eviction policies."
tags:
  - anti-patterns
  - pitfalls
  - architecture
  - best-practices
related:
  - keys-vs-scan
  - configuring-maxmemory
---
> **In one line:** Avoid using Redis as a primary relational database, storing massive unbounded collections, or executing blocking linear queries.

## The idea
Redis is fast because it operates entirely in RAM on an optimized event loop. However, treating Redis like a traditional relational database (RDBMS) or treating RAM like inexpensive disk storage leads to operational disasters.

Recognizing architectural anti-patterns early ensures your Redis deployment remains resilient, cost-effective, and fast.

| Anti-Pattern | Operational Consequence | Recommended Fix |
| :--- | :--- | :--- |
| **Running KEYS in Production** | Freezes server for seconds/minutes | Use `SCAN` with cursor iteration |
| **Unbounded Collections** | Single key consumes gigabytes | Bucket keys or enforce `LTRIM` / pagination |
| **No TTL on Cache Keys** | Uncontrolled memory growth | Always attach TTL with jitter |
| **Using Redis as Source of Truth** | Data loss risk on catastrophic crash | Pair with durable RDBMS or Postgres |
| **Large Value Blobs (>1MB)** | Network saturation and memory fragmentation | Store files in S3/blob store; cache metadata |

## See it
Contrast an anti-pattern with its production-ready alternative:

```bash
# BAD: Querying all user keys with blocking KEYS command
127.0.0.1:6379> KEYS user:*
# BLOCKS THE ENTIRE SERVER!

# GOOD: Non-blocking iterative scanning using SCAN
127.0.0.1:6379> SCAN 0 MATCH user:* COUNT 100
1) "17"
2) 1) "user:101"
   2) "user:102"

# Inspect key types safely
127.0.0.1:6379> TYPE user:101
string
```

Inspect hot or large keys using the safe `redis-cli --bigkeys` analyzer:

```bash
# Scan keyspace non-destructively to identify bloated keys
$ redis-cli --bigkeys
[00.00%] Biggest string found so far 'large_blob' with 10485760 bytes
[02.50%] Biggest list found so far 'events' with 500000 items
[10.00%] Biggest hash found so far 'user:metrics' with 120000 fields
```

## Go deeper
Redis should not be chosen when:
1. **Dataset exceeds available RAM:** If your dataset is 10TB and requires complex multi-table joins, an RDBMS or columnar store is vastly cheaper and better suited.
2. **Strict ACID transactional guarantees across tables:** Redis transactions do not support rollbacks on runtime errors.
3. **Heavy analytical aggregations:** OLAP data warehouses (e.g. BigQuery, ClickHouse) handle analytical group-by operations far more efficiently.

By pairing Redis as a blazing fast caching and coordination layer in front of a persistent system of record (like PostgreSQL or MySQL), you capture the best of both worlds: microsecond query response times with guaranteed durable persistence.

> **Note:** Always define a sane `maxmemory` limit and an eviction policy (`allkeys-lru` or `volatile-lru`) on cache instances to prevent out-of-memory kernel process kills.

## Watch out
* Storing large JSON documents (>1MB) inside Redis strings increases network transit times and causes socket buffer memory spikes.
* Single-threaded architecture means one runaway command impacts all connected microservices.

## Remember
* Never execute `KEYS` or `MONITOR` in production; use `SCAN` and metric exporters instead.
* Enforce TTLs and cap collection sizes to avoid runaway memory consumption.
* Reserve Redis for low-latency caching, fast state management, and real-time queues—not primary OLAP storage.
