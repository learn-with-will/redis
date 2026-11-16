---
slug: redis-8-unified-stack
title: Redis 8 and the Unified Stack
topic: security-and-operations
kind: concept
summary: Discover Redis 8's native integration of JSON, vector search, time-series, and probabilistic structures into core.
tags:
  - redis-8
  - stack
  - modules
  - architecture
related:
  - what-is-redis
  - redis-licensing-and-valkey
---
> **In one line:** Redis 8 natively integrates JSON, secondary query indexing, vector search, and time-series directly into the core engine.

## The idea
Historically, advanced data structures—such as hierarchical JSON documents, vector similarity search, and time-series aggregation—required downloading and managing separate external Redis modules (such as RedisJSON, RediSearch, and RedisTimeSeries) or deploying a separate "Redis Stack" binary.

**Redis 8** represents a major architectural milestone by merging these multi-model capabilities directly into the core server distribution. Advanced data structures are now first-class citizens, available out of the box without complex module configurations.

| Capability | Historical Module | Redis 8 Status | Primary Commands |
| :--- | :--- | :--- | :--- |
| **JSON Documents** | RedisJSON | Native core | `JSON.SET`, `JSON.GET` |
| **Secondary Indexing** | RediSearch | Native core | `FT.CREATE`, `FT.SEARCH` |
| **Vector Similarity** | RediSearch | Native core | HNSW / Flat vector search |
| **Time Series** | RedisTimeSeries | Native core | `TS.ADD`, `TS.RANGE` |
| **Probabilistic Filters**| RedisBloom | Native core | `BF.ADD`, `CF.ADD`, `CMS.INCRBY` |

## See it
Verify module and engine capabilities in Redis 8:

```bash
# Check Redis server version
$ redis-server --version
Redis server v=8.0.0 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64

# Native JSON and search commands work out of the box without MODULE LOAD
127.0.0.1:6379> JSON.SET user:8 '{"name": "Alice", "role": "admin", "skills": ["redis", "python"]}'
OK

127.0.0.1:6379> JSON.GET user:8 $.skills[0]
"["redis"]"

# Native probabilistic Bloom filters work immediately
127.0.0.1:6379> BF.ADD usernames "alice"
(integer) 1

# Inspect module presence in the unified binary
127.0.0.1:6379> MODULE LIST
```

## Go deeper
By consolidating the codebases into a unified core engine, Redis 8 eliminates the memory copy overhead that previously occurred when passing data between the Redis core and dynamic C modules.

Furthermore, replication, RDB snapshotting, AOF rewrites, and cluster slot migration now handle JSON and vector indexes natively as first-class memory payloads, streamlining backup and disaster recovery across enterprise clusters. Application architects can now build rich AI agent memories, semantic search caches, and document stores directly on a single Redis deployment without juggling disparate add-on packages.

This unification also simplifies local development environments and automated test pipelines. Developers can spin up standard Redis 8 container images without tracking specialized module build dependencies or license compatibility matrices across environments.

> **Note:** Existing Redis 7 module commands remain fully backward-compatible in Redis 8, ensuring zero migration friction for existing codebases.

## Watch out
* Advanced features like vector indexes and multi-field queries consume additional RAM beyond raw string storage; size memory capacity accordingly.
* Ensure client driver libraries are updated to versions that support Redis 8 unified command namespaces.

## Remember
* Redis 8 merges RedisJSON, RediSearch, RedisTimeSeries, and RedisBloom into the core engine.
* No separate `MODULE LOAD` steps or specialized "Redis Stack" container images are required.
* First-class integration improves memory efficiency, serialization speed, and cluster replication consistency.
