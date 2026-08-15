---
id: lesson-24
slug: data-modeling-and-capstone
title: "Data Modeling and Capstone"
level: advanced
order: 24
duration: 26
tags:
  - data-modeling
  - key-design
  - patterns
  - anti-patterns
  - capstone
summary: "Bringing it together: choosing the right data structure, designing keys, avoiding anti-patterns, and combining structures into real features — a rate limiter, session store, leaderboard, and job queue — plus when NOT to use Redis."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Choose the **right data structure** for a problem using a simple decision guide.
- Design **keys** well and build **secondary indexes** by hand when needed.
- Recognize and avoid common **anti-patterns**.
- Combine structures into real features (rate limiter, session store, leaderboard, job queue).
- Judge **when *not* to use Redis**.

# Why It Matters

You now know the data types, persistence, scaling, and operations. The final skill is **design**:
picking the right structure, naming keys so a system stays comprehensible, and combining pieces into real
features — while knowing where Redis's strengths end. Good modeling is what makes Redis a joy; poor
modeling is what makes it a liability.

# Concept Explanation

### Choosing the right structure

Most modeling questions reduce to matching the problem to a type:

| If you need… | Use | Because |
| ------------ | --- | ------- |
| A single value, counter, or flag | **String** | Simple, atomic `INCR`, TTLs |
| The fields of one object | **Hash** | Grouped, memory-efficient, per-field updates |
| A queue, stack, or "recent N" | **List** | O(1) at the ends; blocking pops |
| A set of unique items / membership / relationships | **Set** | Uniqueness + set algebra |
| A ranking, range-by-score, or priority queue | **Sorted Set** | Ordered by score, O(log N) |
| A durable, replayable event log / reliable queue | **Stream** | Persistence + consumer groups |
| Approximate unique counts at scale | **HyperLogLog** | Fixed tiny memory |
| Query by content / search / similarity | **JSON + Query Engine / Vector Sets** | Secondary indexes, vector search |

### Designing keys

- **Namespaces:** use `type:id:field` conventions (`user:42:session`, `order:1001:items`) so keys are
  self-describing and patterns are meaningful.
- **Composite keys:** encode the identifying dimensions (`rate:{user:42}:2026-08-15`), and in Cluster use
  **hash tags** `{...}` for keys that must share a slot.
- **Secondary indexes by hand:** core Redis looks up by key, so to query "all orders for user 42," keep a
  **Set** `user:42:orders` of order IDs, or a **Sorted Set** scored by time. (Or use the Query Engine to
  index automatically, per the previous lesson.)
- **TTLs by default** on anything cache-like, so nothing lingers forever.

### Anti-patterns to avoid

- **Big keys** — a single collection with millions of elements or a multi-MB value; O(N) operations on it
  block the server. Split or bound them.
- **Unbounded growth** — lists/streams/sorted sets that only ever grow; always cap (`LTRIM`, stream
  `MAXLEN`, prune sorted sets).
- **`KEYS` in production** — use `SCAN`.
- **One giant hash as a database table** — `HGETALL` on it is O(N); model it as many keys or use the Query
  Engine.
- **Redis as the only home for precious data without a durability plan** — decide persistence/replication
  deliberately (earlier lessons).

### Combining structures — real features

The power shows when you compose types into features:

- **Rate limiter (fixed window):** `INCR rate:{user}:{minute}` and set `EXPIRE 60` on first hit; reject
  when the count exceeds the limit. (A sliding window can use a Sorted Set of timestamps with
  `ZREMRANGEBYSCORE` to drop old ones.)
- **Session store:** a **Hash** `session:<token>` holding session fields, with a TTL (`EXPIRE`) that you
  refresh on activity (`GETEX`/`EXPIRE`).
- **Leaderboard:** a **Sorted Set** scored by points; `ZINCRBY` to update, `ZRANGE ... REV` for the top N,
  `ZREVRANK` for a player's rank.
- **Job queue:** a **List** (`RPUSH`/`BLPOP`) for simple queues, or a **Stream** with consumer groups when
  you need acknowledgements, replay, and multiple workers.

Notice how each reuses the primitives from earlier lessons — the art is selecting and bounding them.

### When *not* to use Redis

Redis is superb within its niche and a poor fit outside it. Reach for something else when:

- **The data is much larger than RAM** and cost/access patterns don't justify keeping it in memory.
- **You need rich ad-hoc queries, joins, or reporting** across the whole dataset — a relational or
  document database is built for that (the Query Engine helps, but isn't a full SQL analytics engine).
- **You need strong transactional guarantees with rollback** or strict multi-key consistency — Redis
  transactions don't roll back, and replication/Cluster are asynchronous.
- **The data must be the durable system of record with strict guarantees** you don't want to hand-tune —
  a purpose-built database may fit better, with Redis in front as a cache.

Using Redis *alongside* the right database — as a cache and for real-time features — is usually the
winning architecture.

# Key Terminology

- **Data modeling** — choosing structures and key designs that fit the access patterns.
- **Secondary index** — an extra structure (a Set/Sorted Set, or a Query Engine index) to look data up by
  something other than its primary key.
- **Big key** — an oversized single key that makes operations slow; an anti-pattern.
- **System of record** — the authoritative, durable store for data (often *not* Redis).

# Options and Trade-offs

Job queue design, as one example of choosing among structures:

| Option | Delivery | Multiple workers | Replay/acks | Use when |
| ------ | -------- | ---------------- | ----------- | -------- |
| **List** (`RPUSH`/`BLPOP`) | One consumer per item | Yes (share the list) | No | Simple queues, loss-tolerant |
| **List + processing list** (`LMOVE`) | One per item, recoverable | Yes | Manual | Jobs must survive a crash |
| **Stream + consumer group** | At-least-once | Yes (splits work) | Yes | Reliable, replayable pipelines |

# Worked Example

Compose a small system: a per-user rate limiter, a leaderboard, and a session — each with the right
structure.

```text
# Rate limiter: max 3 actions/minute
127.0.0.1:6379> INCR rate:user42:202608151230
(integer) 1
127.0.0.1:6379> EXPIRE rate:user42:202608151230 60
(integer) 1

# Leaderboard update + read
127.0.0.1:6379> ZINCRBY game:leaderboard 10 "user42"
"10"
127.0.0.1:6379> ZREVRANK game:leaderboard "user42"
(integer) 0

# Session as a hash with a TTL
127.0.0.1:6379> HSET session:tok123 user "42" theme "dark"
(integer) 2
127.0.0.1:6379> EXPIRE session:tok123 1800
(integer) 1
```

Three features, three structures chosen deliberately: an **expiring counter** for the rate limit, a
**sorted set** for the ranking, and a **hash with a TTL** for the session. Each is the natural fit — and
each is bounded (the counter and session expire; the leaderboard would be pruned/capped in production).

# Real World Analogy

Modeling with Redis is like **stocking a well-run kitchen**. Each tool has a job: a whisk (sorted set)
for whipping rankings, a conveyor (list/stream) for orders, labeled containers (hashes) for prepped
ingredients, a tally counter (string) at the door. A great cook reaches for the **right** tool, keeps the
station **tidy and bounded** (no giant unlabeled pot boiling over), and knows which dishes belong in the
**walk-in freezer next door** (the durable database) rather than on the hot line.

# Examples

## Example 1 — Basic: pick the structure

"Track which articles a user has read." Unordered, unique, membership-tested → a **Set** `user:42:read`.
"Show the 10 most recently read" → a capped **List** or a **Sorted Set** scored by time.

**Why this works:** matching the access pattern (uniqueness vs. recency/order) to the type gives the
simplest correct design.

## Example 2 — Real-world: a full feature from primitives

A "trending posts" feature: increment a **Sorted Set** score on each view (`ZINCRBY trending 1
post:99`), read the top 10 with `ZRANGE ... REV`, and periodically decay scores (or use a time-bucketed
approach). One structure, composed with a decay routine, delivers the feature.

**Why this works:** the sorted set maintains the ranking continuously; the design bounds it with decay so
it reflects "trending now."

## Example 3 — Trade-off / pitfall: forcing Redis to be the whole database

An app stores all its relational data in Redis and tries to answer complex reporting queries by scanning
keys in application code. It's slow, fragile, and memory-hungry.

**Why this bites:** ad-hoc relational queries and full-dataset reporting are outside Redis's sweet spot.
Keep the system of record in a database built for querying, and use Redis for caching and real-time
structures.

# Common Mistakes

- **Defaulting to Strings for everything.** Often a Hash, Set, or Sorted Set models the problem far
  better.
- **Unbounded collections and big keys.** Cap and split; they cause latency and memory problems.
- **No secondary indexes, then scanning with `KEYS`.** Maintain index sets/sorted sets, or use the Query
  Engine.
- **Treating Redis as a full relational database.** Use it with one, not instead of one, for query-heavy
  or strictly-durable data.

# Best Practices

- **Match the structure to the access pattern** first; let that drive the design.
- Use clear **`type:id:field`** key names and maintain **secondary indexes** for non-key lookups.
- **Bound everything**: TTLs on cache keys, caps on lists/streams/sorted sets.
- **Compose primitives** into features (rate limiter, session, leaderboard, queue) and keep each piece
  simple.
- Know the **edges**: keep the durable system of record and heavy queries in a database; use Redis for
  speed and real-time.

# Summary

- **Choose the structure** by access pattern: String/Hash/List/Set/Sorted Set/Stream/HyperLogLog, or
  JSON + Query Engine / Vector Sets for content and similarity.
- **Design keys** with clear namespaces and **composite** names (hash tags in Cluster), and build
  **secondary indexes** (sets/sorted sets or the Query Engine) for non-key lookups.
- Avoid **anti-patterns**: big keys, unbounded growth, `KEYS`, one-giant-hash tables, and undurable
  storage of precious data.
- **Compose primitives** into real features — rate limiter (expiring counter/sorted set), session (hash +
  TTL), leaderboard (sorted set), job queue (list or stream).
- Know **when not to use Redis**: data ≫ RAM, rich ad-hoc queries/joins, or strict transactional/durable
  guarantees — pair Redis *with* the right database instead.

# Flash Cards

Q: What should drive your choice of Redis data structure?
A: The access pattern — need order? uniqueness? ranking? object fields? a durable log? — matched to the type that supports it directly.

Q: How do you look data up by something other than its key in core Redis?
A: Build a secondary index yourself (e.g. a Set or Sorted Set of IDs), or use the Query Engine to index hashes/JSON automatically.

Q: Name two anti-patterns to avoid when modeling with Redis.
A: Big keys (huge single collections/values) and unbounded growth; also KEYS in production and using one giant hash as a database table.

Q: Which structure fits a leaderboard, and which fits a reliable, replayable job queue?
A: A Sorted Set for the leaderboard; a Stream with consumer groups for a reliable, replayable job queue.

Q: How would you build a fixed-window rate limiter?
A: INCR a per-user-per-window counter key and set EXPIRE on the window; reject requests once the count exceeds the limit (the key resets when it expires).

Q: When should you NOT use Redis?
A: When data is much larger than RAM, you need rich ad-hoc queries/joins/reporting, or you need strong transactional guarantees with rollback — use a purpose-built database (often with Redis as a cache in front).

# Exercises

### Easy
For each need, name the best structure: (a) a page-view counter, (b) a user's profile fields, (c) a
top-10 scoreboard, (d) a set of tags. Justify each in a few words.

### Medium
Design the keys and structures for a session system: what holds the session, how you set and refresh its
TTL, and how you'd list all active sessions for one user (hint: a secondary index). Write the commands.

### Challenging
Design a complete "background job" system in Redis: choose between a List and a Stream and justify it,
show how a job is enqueued and processed reliably (including crash recovery), how you bound growth, and
where the *results* and any *durable* record should live. Then state one scenario where you'd move this
off Redis entirely and why.

# Further Reading

- Redis — *Data types* (overview to choose from): <https://redis.io/docs/latest/develop/data-types/>
- Redis — *Patterns* (rate limiting, and more): <https://redis.io/docs/latest/develop/use/patterns/>
- Redis — *Keyspace & key design*: <https://redis.io/docs/latest/develop/using-commands/keyspace/>
- Redis — *Search and query* (secondary indexing): <https://redis.io/docs/latest/develop/interact/search-and-query/>
