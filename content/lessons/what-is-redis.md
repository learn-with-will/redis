---
slug: what-is-redis
title: "What is Redis: In-Memory Key-Value Store"
topic: fundamentals
kind: concept
summary: Redis is an in-memory data structure store used as a cache, database, and message broker.
tags:
  - fundamentals
  - in-memory
  - key-value
  - cache
related:
  - single-threaded-execution
  - redis-vs-memcached-and-rdbms
  - installing-and-running-redis
---
> **In one line:** Redis is an in-memory key-value data structure store delivering sub-millisecond responses for caching, databases, and messaging.

## The idea

Redis stands for **REmote DIctionary Server**. Unlike traditional relational databases that persist primary records to magnetic disk or flash storage and organize data into tabular schemas, Redis maintains its entire operational dataset directly in random-access memory (**RAM**). Because memory operations avoid physical disk I/O, reads and writes typically execute in sub-millisecond time.

Redis is fundamentally distinct from simple key-value caches because its values are not limited to plain text blobs. Instead, it natively manages structured data types: strings, lists, hashes, sets, sorted sets, bitmaps, hyperloglogs, and streams. You manipulate items directly in place on the server rather than serializing and transporting full payloads back and forth.

| Architectural Dimension | Redis Characteristics | Traditional RDBMS |
|---|---|---|
| **Primary Storage** | RAM (In-Memory) | Persistent Block Storage (Disk/SSD) |
| **Data Organization** | Keys mapped to typed structures | Normalized relational tables with foreign keys |
| **Typical Latency** | Microseconds (< 1ms) | Milliseconds (5ms – 50ms) |
| **Durability Model** | In-memory first, asynchronous disk persistence | Synchronous Write-Ahead Logging (WAL) |

> **Note:** Because RAM is volatile and lost upon process termination, Redis provides optional background snapshots (RDB) and append-only command logs (AOF) for durability.

## See it

In a standard client session, communicating with Redis requires sending simple structured command strings over the network to inspect and mutate keys:

```bash
# Connect to the Redis instance
redis-cli

# Set a string key and retrieve its value
SET greeting "Welcome to Redis"
GET greeting

# Store and increment an atomic integer counter
INCR page:views
INCR page:views
INCRBY page:views 10

# Inspect the stored data type
TYPE page:views
```

Each operation executes directly on the server without requiring complex transaction setup or client-side locks. The `INCR` command guarantees that concurrent clients increment the counter safely without race conditions or lost updates.

## Go deeper

Redis serves three primary system architecture roles in modern software engineering:
1. **Application Cache:** Offloading repetitive, expensive database queries by storing serialized objects with explicit time-to-live expirations.
2. **Primary In-Memory Database:** Serving low-latency state such as user sessions, real-time gaming leaderboards, shopping carts, and rate-limiting sliding windows.
3. **Message Broker:** Distributing decoupled event notifications using lightweight fire-and-forget publish/subscribe channels or durable append-only event streams.

Because memory is a finite resource, Redis tracks byte-level allocations and provides configurable eviction policies when server memory bounds are reached.

## Watch out

- Never treat Redis as an infinite disk replacement; every stored key and payload consumes physical server RAM.
- Operating Redis without memory bounds can trigger the operating system Out-Of-Memory (OOM) process killer.

## Remember

- Redis stores data in RAM to achieve predictable microsecond response latencies.
- Values are rich data structures with dedicated atomic operations, not just opaque string blobs.
- Redis operates as a cache, primary database, and message broker depending on persistence configuration.
