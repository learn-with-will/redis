---
slug: logical-databases-select
title: Logical Databases and the SELECT Command
topic: fundamentals
kind: pitfall
summary: Redis defaults to 16 zero-indexed logical databases, but using SELECT in production is a recognized anti-pattern.
tags:
  - databases
  - select
  - architecture
  - pitfall
related:
  - connecting-with-redis-cli
  - what-is-redis
  - keyspace-and-key-naming
---
> **In one line:** Redis provides 16 numerical logical databases via `SELECT`, but production systems should avoid them in favor of separate instances or key namespaces.

## The idea

By default, a standalone Redis server allocates 16 **logical databases**, identified numerically from `0` to `15`. New client connections default to database `0`. Clients can switch between these numeric namespaces using the `SELECT <db>` command.

While logical databases were originally intended to separate environments (such as staging vs. production or user sessions vs. product cache) within a single server, they share the single main thread, memory budget, and persistence logs.

| Characteristic | Logical Databases (`SELECT 0..15`) | Dedicated Redis Instances |
|---|---|---|
| **CPU Isolation** | None; slow query in DB 1 freezes DB 0 | Complete process and core isolation |
| **Memory Isolation** | Shared global `maxmemory` pool | Dedicated memory bounds per instance |
| **Cluster Support** | **Not supported**; Redis Cluster only permits DB 0 | Full Redis Cluster compatibility |
| **Administrative Control** | `FLUSHALL` wipes every database simultaneously | Wiping one instance does not affect others |

> **Watch out:** Redis Cluster strictly disallows logical databases; only database `0` is supported. Relying on `SELECT` prevents future architectural scaling.

## See it

Switching between databases in `redis-cli`:

```bash
# Default active database is 0
127.0.0.1:6379> SET app:status "online"
OK

# Switch to logical database 1
127.0.0.1:6379> SELECT 1
OK
127.0.0.1:6379[1]> GET app:status
(nil)

# Return to database 0
127.0.0.1:6379[1]> SELECT 0
OK
127.0.0.1:6379> GET app:status
"online"
```

Notice how `redis-cli` displays `[1]` in the prompt when an alternate database is selected. Keys created in database 0 do not appear in database 1.

## Go deeper

The command `FLUSHDB` deletes all keys in the *currently selected* database. In contrast, `FLUSHALL` deletes all keys across *all 16 logical databases* at once. Multiple production outages have occurred when an operator intending to clear a test database executed `FLUSHALL` or misidentified their active `SELECT` index.

Furthermore, connection pooling libraries in application runtimes (such as Node.js, Python, or Go) frequently pool connections across worker threads, leading to silent state corruption if a pooled connection switches databases without resetting.

## Watch out

- Using `SELECT` gives a false sense of isolation; a memory leak or CPU spike in one logical database crashes the entire server.
- Modern Redis drivers and connection pooling libraries often encounter race conditions when connection threads execute `SELECT`.

## Remember

- Redis provides 16 logical databases numbered 0 to 15, defaulting to index 0.
- Logical databases share CPU, memory limits, and persistence pipelines.
- Modern architectures avoid `SELECT` in favor of key prefixing or isolated Redis containers.
