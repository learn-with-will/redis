---
slug: identifying-slow-queries-slowlog
title: Identifying Slow Queries with SLOWLOG
topic: security-and-operations
kind: tool
summary: Profile latency bottlenecks using the in-memory SLOWLOG system, execution time thresholds, and slowlog inspect commands.
tags:
  - slowlog
  - latency
  - profiling
  - diagnostics
related:
  - single-threaded-execution
  - keys-vs-scan
---
> **In one line:** SLOWLOG records in-memory execution durations exceeding a microsecond threshold to uncover blocking commands.

## The idea
Because Redis processes commands sequentially on a single thread, any command that takes 50 milliseconds blocks all other client requests for that entire duration. Identifying and eliminating slow commands is the single most important task in Redis performance optimization.

The **SLOWLOG** records queries whose execution time exceeded a configured threshold. Crucially, the slowlog measures *only the time spent executing the command in RAM*—it excludes network communication, socket I/O, and reply buffering.

| Configuration Parameter | Purpose | Default |
| :--- | :--- | :--- |
| `slowlog-log-slower-than` | Microsecond threshold to record (-1 disables, 0 logs all) | 10000 (10ms) |
| `slowlog-max-len` | Maximum entries retained in the in-memory circular ring | 128 entries |

## See it
Configure and query the slowlog dynamically using `redis-cli`:

```bash
# Set slowlog threshold to 1 millisecond (1000 microseconds)
127.0.0.1:6379> CONFIG SET slowlog-log-slower-than 1000
OK

# Expand memory log capacity to 256 entries
127.0.0.1:6379> CONFIG SET slowlog-max-len 256
OK

# Retrieve the 2 most recent slow queries
127.0.0.1:6379> SLOWLOG GET 2
1) 1) (integer) 42              # Unique entry ID
   2) (integer) 1620001234      # Unix timestamp
   3) (integer) 45020           # Execution duration in MICROSECONDS (45ms)
   4) 1) "KEYS"                 # Command arguments
      2) "user:*"
   5) "127.0.0.1:51234"         # Client IP and port
   6) "app-worker-1"            # Client name (if set)

# Inspect how many slow queries are currently logged
127.0.0.1:6379> SLOWLOG LEN
(integer) 42

# Reset and clear the slowlog buffer
127.0.0.1:6379> SLOWLOG RESET
OK
```

## Go deeper
In the example above, an errant developer issued `KEYS user:*`, blocking the Redis engine for 45 milliseconds. Other common slowlog culprits include `HGETALL` on hashes with 100,000 fields, large `SMEMBERS` queries, or unbounded `LRANGE` requests.

Regularly auditing the slowlog allows engineering teams to detect bad access patterns before they cause site-wide cascading connection timeouts. You can integrate Prometheus `redis_exporter` or Datadog agents to scrape `SLOWLOG LEN` and generate alerts whenever slow queries spike.

> **Tip:** In production, set `slowlog-log-slower-than 1000` (1ms). A well-architected Redis database should execute nearly all operational commands in less than 500 microseconds.

## Watch out
* SLOWLOG does not log time spent waiting in the socket buffer or network transit delays.
* The slowlog is an in-memory ring buffer; older entries are overwritten once `slowlog-max-len` is exceeded.

## Remember
* SLOWLOG logs operations exceeding `slowlog-log-slower-than` microseconds of CPU execution time.
* It measures only internal engine processing, completely excluding network transmission latency.
* Use `SLOWLOG GET` regularly in production dashboards to track down blocking linear-time commands.
