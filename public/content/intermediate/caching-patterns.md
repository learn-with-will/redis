---
id: lesson-16
slug: caching-patterns
title: "Caching Patterns"
level: intermediate
order: 16
duration: 24
tags:
  - caching
  - cache-aside
  - invalidation
  - stampede
  - ttl
summary: "The patterns that make Redis a great cache: cache-aside, read-through, write-through, and write-behind; TTL strategies; the cache-stampede problem and its fixes; invalidation; and server-assisted client-side caching."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Implement the **cache-aside** (lazy-loading) pattern and know its read/write flow.
- Compare **read-through**, **write-through**, and **write-behind** strategies.
- Prevent a **cache stampede** (thundering herd) when a hot key expires.
- Choose an **invalidation** approach and understand its consistency trade-offs.
- Explain **server-assisted client-side caching** (`CLIENT TRACKING`).

# Why It Matters

Caching is the number-one reason people adopt Redis, and it's deceptively easy to do badly. The
patterns here are the difference between a cache that quietly absorbs load and one that serves stale
data, stampedes your database at the worst moment, or drifts out of sync with the source of truth.
These are the design decisions, not new commands — and they matter more than any single command.

# Concept Explanation

### Cache-aside (lazy loading)

The most common pattern. The **application** manages the cache:

1. On a read, check Redis first.
2. **Hit** → return the cached value.
3. **Miss** → load from the database, store it in Redis **with a TTL**, and return it.

```text
GET  product:42            -> (nil)          # miss
# app queries the database, gets the product
SET  product:42 "<json>" EX 300              # populate with a 5-min TTL
GET  product:42            -> "<json>"        # subsequent reads hit
```

Only requested data is cached ("lazy"), and TTLs keep it fresh enough. The cost: the *first* request
for each key pays the slow path, and there's a window where the cache and database can disagree.

### Read-through vs write-through vs write-behind

Cache-aside puts the logic in your app. Other patterns move it around or change *when* writes reach
the database:

- **Read-through** — reads go *through* a cache layer that loads from the database on a miss itself
  (the loading logic lives in the cache/library, not scattered in app code). The end effect is like
  cache-aside, but centralized.
- **Write-through** — every write updates the **cache and the database synchronously**. The cache is
  always current, at the cost of higher write latency (you pay both writes).
- **Write-behind (write-back)** — writes go to the **cache immediately** and are flushed to the
  database **asynchronously** later. Writes feel instant, but a crash before the flush can **lose
  data**, and the database is briefly behind.

### TTLs and the cache stampede

TTLs keep cached data from going stale forever, but they create a hazard. Imagine a very popular key
with a 60-second TTL. The instant it expires, **every** in-flight request misses at once and they all
hit the database together to recompute it — a **cache stampede** (a.k.a. thundering herd) that can
overwhelm the backend precisely when traffic is high.

Common defenses:

- **TTL jitter** — add a small random offset to TTLs so many keys don't expire at the same instant.
- **A recompute lock** — when a key misses, only the first request acquires a short lock (e.g. `SET
  lock:product:42 1 EX 5 NX`) and recomputes; others briefly wait or serve slightly stale data.
- **Early / probabilistic recomputation** — refresh a hot key *before* it expires, so it's rarely
  actually empty.
- **Stale-while-revalidate** — serve the old value while a background refresh runs.

### Invalidation

The other hard part of caching is keeping it in sync when the source changes. Two moves:

- **Delete on write** — when the underlying data changes, `DEL` the cache key so the next read
  repopulates it. Simple and robust (the next read is authoritative).
- **Update on write** — write the new value into the cache directly. Fewer misses, but risk of writing
  a value that races with another update.

Deleting is usually safer than updating, because the next read always reloads the truth. Either way,
a **TTL is a safety net**: even if an invalidation is missed, the stale entry eventually expires. As
the saying goes, cache invalidation is one of the genuinely hard problems in computing — lean on TTLs
so mistakes self-heal.

### Server-assisted client-side caching

Redis can help clients cache data **locally** (in the app's own memory) and tell them when it changes.
With **client-side caching** (`CLIENT TRACKING`, using RESP3), the client keeps a local copy of keys
it fetched, and the Redis server sends an **invalidation message** when one of those keys is modified,
so the client drops its stale copy. This pushes reads to near-zero latency (they never leave the app)
while keeping them reasonably fresh — at the cost of more complexity.

# Key Terminology

- **Cache-aside / lazy loading** — the app checks the cache and populates it on a miss.
- **Read-through / write-through / write-behind** — where read-loading and write-persisting happen,
  and whether writes to the DB are synchronous or deferred.
- **Cache stampede (thundering herd)** — many simultaneous misses on a hot key hammering the backend.
- **Invalidation** — removing or updating a cache entry when the source data changes.
- **Client-side caching (`CLIENT TRACKING`)** — clients cache locally; Redis sends invalidations.

# Options and Trade-offs

| Pattern | Cache freshness | Write latency | Risk | Best for |
| ------- | --------------- | ------------- | ---- | -------- |
| **Cache-aside** | Eventual (TTL-bounded) | Normal (DB write only) | Brief staleness after a write | Most read-heavy workloads |
| **Write-through** | Always fresh | Higher (cache + DB) | None (but slower writes) | Read-after-write consistency needs |
| **Write-behind** | Fresh in cache, DB lags | Very low | Data loss if it crashes before flush | Write-heavy, loss-tolerant |
| **Client-side caching** | Near-real-time (invalidations) | Normal | More client complexity | Ultra-hot reads of a small key set |

# Worked Example

Cache-aside with a stampede guard: on a miss, one request takes a lock and recomputes; the TTL carries
jitter so keys don't all expire together.

```text
# Read path
127.0.0.1:6379> GET product:42
(nil)                                   # miss
# Try to become the single recomputer:
127.0.0.1:6379> SET lock:product:42 1 EX 5 NX
OK                                      # we won the lock -> recompute from DB
# (another concurrent request would get (nil) here and briefly wait / serve stale)
127.0.0.1:6379> SET product:42 "<fresh json>" EX 312
OK                                      # 300s base + up to ~12s jitter
127.0.0.1:6379> DEL lock:product:42
(integer) 1
```

The first request wins the `NX` lock and refreshes the key; concurrent requests don't all stampede the
database. The jittered TTL (312 instead of a flat 300) staggers expiry across many keys.

# Real World Analogy

Cache-aside is a **barista keeping a small stock of pre-made drinks**: if your order is in stock, you
get it instantly; if not, they make it fresh and put a spare aside for the next person (with a
best-by time). A **stampede** is the morning rush all ordering the one drink that just sold out — the
barista is swamped making the same thing ten times. The **lock** is the barista saying "I'm making a
fresh batch, one moment" instead of ten baristas starting ten identical batches.

# Examples

## Example 1 — Basic: caching an expensive query

A dashboard runs a heavy aggregate query. Wrap it in cache-aside with a 60-second TTL: the first load
computes and caches; the next minute of loads are instant. When the TTL lapses, one recompute
refreshes it.

**Why this works:** read-heavy, tolerant of up-to-a-minute staleness — the textbook fit for
cache-aside.

## Example 2 — Real-world: invalidate on update

A product's price changes. The write path updates the database and `DEL product:42`. The next read
misses, reloads the new price, and re-caches it — so customers never see the old price for longer than
one read.

**Why this works:** delete-on-write plus repopulate-on-read keeps the cache authoritative without
trying to keep it perfectly in lockstep.

## Example 3 — Trade-off / pitfall: write-behind and a crash

A metrics service uses write-behind: increments go to Redis and flush to the database every 10
seconds. Redis restarts (persistence off) after 8 seconds of updates — those 8 seconds of metrics are
gone, and the database never saw them.

**Why this bites:** write-behind trades durability for speed. If the buffered writes matter, you need
persistence and/or a shorter flush window — or a different pattern.

# Common Mistakes

- **Flat TTLs on many hot keys.** Synchronized expiry causes stampedes; add jitter.
- **No stampede protection on very hot keys.** One expiry can unleash a thundering herd; use a lock or
  early refresh.
- **Updating the cache but forgetting to invalidate on writes.** The cache drifts from the source;
  prefer delete-on-write plus a TTL safety net.
- **Treating write-behind as durable.** Buffered writes can be lost on a crash.
- **Caching without any TTL.** A missed invalidation then means *permanent* staleness.

# Best Practices

- Default to **cache-aside** with sensible, **jittered** TTLs for read-heavy data.
- Protect hot keys from **stampedes** with a recompute lock, early refresh, or stale-while-revalidate.
- **Invalidate on write** (usually delete-then-reload), and always keep a **TTL** as a backstop.
- Use **write-through** when reads must reflect writes immediately; use **write-behind** only when you
  can tolerate loss and have thought through durability.
- Consider **client-side caching** (`CLIENT TRACKING`) for a small set of extremely hot keys.

# Summary

- **Cache-aside** (lazy loading): app checks Redis, and on a miss loads from the DB and caches with a
  TTL — the default pattern for read-heavy workloads.
- **Read-through / write-through / write-behind** move the read-loading and write-persisting logic and
  decide whether DB writes are **synchronous** (fresh, slower) or **deferred** (fast, loss-prone).
- A **cache stampede** hits when a hot key expires and many misses stampede the backend; fix with
  **TTL jitter, recompute locks, early refresh, or stale-while-revalidate**.
- **Invalidate on write** (prefer delete-then-reload) and keep a **TTL** so missed invalidations
  self-heal.
- **Server-assisted client-side caching** (`CLIENT TRACKING`) lets clients cache locally with Redis
  pushing invalidations.

# Flash Cards

Q: Describe the cache-aside read flow.
A: Check Redis; on a hit return it; on a miss load from the database, store it in Redis with a TTL, and return it.

Q: How do write-through and write-behind differ?
A: Write-through writes to cache and database synchronously (always fresh, slower); write-behind writes to cache now and flushes to the database asynchronously (fast, but can lose data on a crash).

Q: What is a cache stampede (thundering herd)?
A: When a hot key expires and many simultaneous requests all miss and hit the backend at once, potentially overwhelming it.

Q: Name two ways to prevent a cache stampede.
A: TTL jitter (so keys don't expire together) and a recompute lock (only one request rebuilds the key); early/probabilistic refresh and stale-while-revalidate also work.

Q: Why is a TTL a good safety net even when you invalidate on writes?
A: If an invalidation is ever missed, the stale entry still expires on its own, so mistakes self-heal instead of persisting forever.

Q: What does server-assisted client-side caching (CLIENT TRACKING) do?
A: It lets clients cache keys locally while Redis sends invalidation messages when those keys change, keeping local copies fresh.

# Exercises

### Easy
Simulate cache-aside: `GET report:1` (miss), then `SET report:1 "<data>" EX 60`, then `GET report:1`
(hit). Explain what your application would do on the miss step in real code.

### Medium
Implement a stampede guard in `redis-cli`: on a miss, `SET lock:report:1 1 EX 5 NX`. Show that a
second attempt to acquire the same lock returns `(nil)`. Explain how this stops many requests from
recomputing the same key at once.

### Challenging
Design invalidation for a product cache. When a price changes, decide between deleting vs. updating
the cache key, justify your choice, and explain what TTL you'd still set and why. Then describe the
failure mode if you cached with no TTL and an invalidation message was lost.

# Further Reading

- Redis — *Client-side caching*: <https://redis.io/docs/latest/develop/reference/client-side-caching/>
- Redis — *CLIENT TRACKING*: <https://redis.io/commands/client-tracking/>
- Redis — *Two ways to use Redis for caching* (patterns overview): <https://redis.io/docs/latest/develop/use/patterns/>
- Redis — *SET* (for populating cache entries with EX/NX): <https://redis.io/commands/set/>
