# Redis Study Pathway
### A Comprehensive, Phase-by-Phase Curriculum

> **Based on:** the official Redis documentation (redis.io/docs), the Redis command
> reference (redis.io/commands), the RESP protocol spec, the Redis source and release
> notes (github.com/redis/redis), and — for the licensing history — redis.io/legal and
> valkey.io.
> **Approach:** learn the data model first (keys and the core types), then the patterns
> built on top (messaging, atomicity, durability, caching), then how to run Redis in
> production (performance, replication, HA, Cluster, security, operations, modern data).
> Every command and behavior is verified against a primary source; where reasonable people
> disagree (RDB vs AOF, when to shard), it is taught as a trade-off, not a rule.
> **Language:** plain and welcoming; every term is defined the first time it appears. No
> prior Redis knowledge assumed.

---

## Phase 1 — Beginner: Fundamentals & Core Data Types

**Goal:** Understand what Redis is and get fluent with the core data types on your own
machine.
**Exit criteria:** You can start Redis, use `redis-cli`, and confidently choose and use
strings, lists, hashes, sets, and sorted sets, plus set and reason about key expiration.

1. **What Is Redis?** — an in-memory key-value store; cache vs. primary database vs. message
   broker; the single-threaded command model (and why that makes commands atomic); Redis
   vs. Memcached vs. a relational database; the ecosystem (Redis Open Source 8, Redis
   Enterprise/Cloud, and the **Valkey** fork) and an honest **licensing history**.
2. **Getting Started: `redis-cli`** — installing Redis (including Docker); `redis-server`
   and `redis-cli`; `PING`, `INFO`, `SELECT` and the 16 logical databases; default port
   **6379**; the request/response (**RESP**) model at a high level.
3. **Keys & Strings** — the keyspace and key-naming conventions; `SET`/`GET`/`DEL`/
   `EXISTS`/`TYPE`; **`KEYS` vs `SCAN`** (and why `KEYS` is a production footgun); strings
   as **binary-safe** values; counters with `INCR`/`DECR`/`INCRBY`; `SET` options
   (`EX`/`PX`/`NX`/`XX`), `SETNX`, `APPEND`, `GETSET`.
4. **Lists** — `LPUSH`/`RPUSH`/`LRANGE`/`LPOP`/`RPOP`/`LLEN`/`LINDEX`/`LREM`/`LTRIM`;
   modeling queues, stacks, and capped/"latest-N" lists; **blocking** pops `BLPOP`/`BRPOP`.
5. **Hashes** — `HSET`/`HGET`/`HMGET`/`HGETALL`/`HDEL`/`HEXISTS`/`HINCRBY`; modeling an
   object as a single key; when a hash beats many separate string keys.
6. **Sets** — `SADD`/`SREM`/`SISMEMBER`/`SMEMBERS`/`SCARD`; **set algebra** `SINTER`/
   `SUNION`/`SDIFF`/`SINTERCARD`; unique items, tags, and simple relationships.
7. **Sorted Sets** — `ZADD`/`ZRANGE`/`ZREVRANGE`/`ZRANGEBYSCORE`/`ZSCORE`/`ZRANK`/
   `ZINCRBY`/`ZPOPMIN`; leaderboards, time-ordered feeds, and priority queues.
8. **Expiration & Key Lifetime** — `EXPIRE`/`PEXPIRE`/`EXPIREAT`/`TTL`/`PERSIST`;
   **passive vs. active** expiration (not a precise timer); how writing a value can clear a
   TTL; a first look at `maxmemory`.

---

## Phase 2 — Intermediate: More Types, Messaging, Atomicity & Durability

**Goal:** Go beyond the basics — specialized types, two messaging models, grouping
commands atomically, keeping data on disk, and using Redis as a cache well.
**Exit criteria:** You can count uniques cheaply, choose Pub/Sub vs. Streams deliberately,
group commands with `MULTI`/`WATCH`, script atomically, configure persistence and eviction,
and apply the common caching patterns.

9. **Bitmaps & HyperLogLog** — bit operations `SETBIT`/`GETBIT`/`BITCOUNT`/`BITOP`;
   **probabilistic** cardinality with `PFADD`/`PFCOUNT`/`PFMERGE`; daily-active-user and
   analytics use cases; the accuracy-for-space trade-off.
10. **Publish/Subscribe** — `SUBSCRIBE`/`PUBLISH`/`PSUBSCRIBE`; **fire-and-forget**
    messaging (offline subscribers miss messages); sharded Pub/Sub in Cluster; when Pub/Sub
    is the wrong tool.
11. **Streams** — `XADD`/`XREAD`/`XRANGE`/`XLEN`; **consumer groups** with `XGROUP`/
    `XREADGROUP`/`XACK`; a durable, replayable log; **Streams vs. Pub/Sub vs. Lists**.
12. **Transactions** — `MULTI`/`EXEC`/`DISCARD`/`WATCH`; optimistic locking (check-and-set);
    the crucial caveat that Redis transactions **do not roll back** on a command error.
13. **Lua Scripting & Functions** — `EVAL`/`EVALSHA`/`SCRIPT LOAD`; scripts run
    **atomically**; **Redis Functions** (`FUNCTION LOAD`/`FCALL`); collapsing round-trips
    without race conditions.
14. **Persistence: RDB & AOF** — **snapshots** vs. the **append-only file**; `SAVE`/
    `BGSAVE`; `appendfsync` policies and their data-loss windows; using both together; what
    "in-memory" really means for durability.
15. **Memory & Eviction** — `maxmemory`; the eight eviction policies (`noeviction` default,
    `allkeys-*`, `volatile-*`); **LRU/LFU are approximated** by sampling; measuring with
    `MEMORY USAGE`.
16. **Caching Patterns** — **cache-aside** (lazy loading), **write-through**, and
    **write-behind**; TTL strategies; the **cache stampede / thundering-herd** problem;
    invalidation; client-side caching (tracking).

---

## Phase 3 — Advanced: Production Redis

**Goal:** Run Redis reliably at scale — make it fast, keep it available, shard it, secure
it, operate it, and use its modern data capabilities.
**Exit criteria:** You can pipeline for throughput, set up replication, add automatic
failover with Sentinel, shard with Cluster, lock Redis down with ACLs and TLS, monitor and
back it up, and model data (and know when *not* to use Redis).

17. **Pipelining & Performance** — **pipelining** to cut round-trip time; the
    single-threaded core plus optional I/O threads; `SLOWLOG`, `LATENCY`, and
    `redis-benchmark`; command **time complexity** and avoiding O(N) traps (`KEYS`,
    big `HGETALL`).
18. **Replication** — primary/replica with `REPLICAOF`; replication is **asynchronous** and
    what that means for consistency; scaling reads; full vs. partial resynchronization.
19. **High Availability with Sentinel** — monitoring, **quorum**, automatic failover, and
    service discovery; **Sentinel (HA, no sharding) vs. Cluster**.
20. **Redis Cluster** — sharding across **16384 hash slots** (`CRC16(key) mod 16384`), not
    consistent hashing; multi-key ops and **hash tags** `{...}`; resharding; `MOVED`/`ASK`
    redirects; consistency limits.
21. **Security** — `requirepass` and **ACLs** (users, rules, categories); **TLS**;
    protected mode; renaming/disabling dangerous commands; why Redis must **never** be
    exposed directly to the internet.
22. **Observability & Operations** — `INFO` sections, `MONITOR`, `SLOWLOG`, `LATENCY`,
    keyspace notifications, and `CLIENT` commands; backups, upgrades, and common production
    pitfalls.
23. **The Redis 8 Data & Query Engine** — **JSON**, the **Query Engine** (search + secondary
    indexing), **probabilistic** types (Bloom, Cuckoo, Count-Min, Top-K), **time series**,
    and **Vector Sets** (vector similarity search) — now part of Redis Open Source 8
    (formerly "Redis Stack").
24. **Data Modeling & Capstone** — choosing the right structure; key-design patterns and
    anti-patterns; combining structures into a real system (rate limiter, session store,
    leaderboard, job queue); **when *not* to use Redis**.

---

## How to use this pathway

- **Don't skip.** Phase 2 assumes you know the core data types; Phase 3 assumes you
  understand persistence, memory, and atomicity. Streams build on Lists and Pub/Sub;
  Cluster builds on replication; caching patterns build on expiration and eviction.
- **Type the commands.** Redis is a skill of the hands. Every lesson's exercises are
  safe-to-try tasks against a throwaway local instance — run them in `redis-cli`.
- **Know what's dangerous.** A few commands can block the server or lose data (`KEYS *` on a
  big keyspace, `FLUSHALL`, `appendfsync no`, an unbounded `maxmemory`). The lessons flag
  these every time and show the safer path.
- **Take the quizzes.** Every lesson has a quiz; a passing score means the ideas landed.
- **Verify against the sources.** When unsure what an option does, check the redis.io
  command page or docs — accuracy over assumption.
