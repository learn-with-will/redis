---
id: lesson-01
slug: what-is-redis
title: "What Is Redis?"
level: beginner
order: 1
duration: 18
tags:
  - fundamentals
  - in-memory
  - key-value
  - cache
  - licensing
summary: "What Redis is — an in-memory key-value store used as a cache, database, and message broker — plus the single-threaded model, how it compares to Memcached and a relational database, the Redis/Valkey ecosystem, and an honest licensing history."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Explain what **Redis** is and the problem an in-memory data store solves.
- Describe the three big roles Redis plays: **cache**, **database**, and **message broker**.
- Explain why Redis executes commands in a **single thread**, and what that does *not* mean.
- Compare Redis with **Memcached** and with a **relational database** at a high level.
- Name the parts of the Redis **ecosystem** (Redis Open Source, Enterprise/Cloud, Valkey) and summarize the **licensing history** accurately.

# Why It Matters

Most applications spend a surprising amount of time waiting: waiting for a database query,
waiting for a slow API, recomputing the same result over and over. Redis exists to make that
waiting disappear. It keeps data in **memory (RAM)** instead of on disk, so reads and writes
typically finish in well under a millisecond.

That speed is why Redis shows up almost everywhere — caching database results, holding user
sessions, powering leaderboards and rate limiters, queuing background jobs, and moving
messages between services. Learning Redis well means learning a tool you will reach for
again and again. And because Redis is simple to misuse ("it's just a cache", "it can't be a
real database"), learning it *accurately* is what separates a footgun from a superpower.

# Concept Explanation

### An in-memory key-value store

Redis stands for **RE**mote **DI**ctionary **S**erver. At its heart it is a **key-value
store**: you give each piece of data a unique **key** (a name, like `user:42:session`) and
Redis stores a **value** for it. In that sense it behaves like a giant dictionary or hash
map that lives in a server process and that many clients can talk to over the network.

What makes Redis more than a plain cache is that the *values* are not just blobs of text.
Redis offers a set of **data structures** — strings, lists, hashes, sets, sorted sets, and
more — with commands tailored to each. You don't fetch a whole list to add one item; you run
one command and Redis updates it in place. This "data structures over the network" idea is
the core of Redis.

Because everything is kept in RAM, Redis is fast — but RAM is volatile (it's lost when the
process stops). Redis addresses that with optional **persistence** to disk, which we'll come
back to.

### The three roles

People use Redis in three overlapping ways:

- **Cache** — store the result of an expensive query or computation under a key with a short
  lifetime, so the next request is instant. This is the most common use.
- **Database** — use Redis as the primary store for data that fits its model well (sessions,
  counters, rate limits, leaderboards, real-time state).
- **Message broker** — move messages between parts of a system using **Pub/Sub** or
  **Streams** (covered later in the course).

### Single-threaded command execution

Here is the fact most often half-remembered: **Redis executes commands one at a time in a
single thread.** There is no locking between commands and no chance of two commands
interleaving — each command runs to completion before the next begins. That is precisely why
**every individual Redis command is atomic**, and it makes Redis's behavior easy to reason
about.

What this does **not** mean is that "Redis is entirely single-threaded". Modern Redis uses
additional threads and processes for other work: it forks a child process to save data in
the background, frees large objects on background threads, and (since Redis 6) can use
optional **I/O threads** to read and write network data faster. The *command logic* is
single-threaded; the plumbing around it is not.

A practical consequence: one slow command blocks every other client. Running `KEYS *` on a
huge keyspace, or `HGETALL` on a hash with millions of fields, freezes the server for
everyone until it finishes. Much of "using Redis well" is avoiding commands that do a lot of
work in one shot.

### Where the data lives (and durability)

Redis keeps the dataset in memory, but it is **not** doomed to lose everything on restart. It
offers two persistence mechanisms — **RDB** point-in-time snapshots and the **AOF**
(append-only file) — that write data to disk so it can be reloaded. They come with different
durability/performance trade-offs, and a default configuration can still lose the most recent
writes on a crash. The honest summary: Redis is **in-memory first, optionally durable**. A
whole later lesson is devoted to this.

# Key Terminology

- **In-memory data store** — a system that keeps its working data in RAM for speed, rather
  than reading it from disk on each access.
- **Key-value store** — a store that maps a unique key to a value; the simplest database
  model.
- **Data structure** — here, one of Redis's value types (string, list, hash, set, sorted
  set, etc.), each with its own commands.
- **Atomic** — an operation that either happens completely or not at all, with no other
  operation observed in the middle. Each Redis command is atomic.
- **Persistence** — writing in-memory data to disk (RDB and/or AOF) so it survives a restart.
- **Cache** — a fast store of copies of data, usually with a time limit, put in front of a
  slower source.
- **Redis Open Source** — the free, self-hostable Redis you download and run yourself.
- **Valkey** — an open-source fork of Redis created in 2024 (see the licensing section).

# Options and Trade-offs

How Redis compares with two things people often weigh it against:

| Option | What it is | Strengths | Watch out for |
| ------ | ---------- | --------- | ------------- |
| **Redis** | In-memory data-structure store | Rich data types, persistence, replication, scripting, Pub/Sub & Streams | Dataset must mostly fit in RAM; you design keys yourself |
| **Memcached** | In-memory cache | Very simple, multi-threaded, great as a plain string cache | Only opaque string values; no persistence or replication built in |
| **Relational database (e.g. PostgreSQL)** | On-disk relational store | Rich queries (SQL, joins), strong durability & transactions (ACID with rollback) | Slower per operation; not built for microsecond key lookups |

The point isn't "Redis wins" — it's that Redis is a *complement*. A common architecture is a
relational database as the source of truth **with Redis in front of it** as a cache and for
real-time features.

# Worked Example

Let's see the "dictionary over the network" idea in a `redis-cli` session. Don't worry about
the exact commands yet — later lessons cover them — just notice the shape.

```text
127.0.0.1:6379> SET greeting "hello"
OK
127.0.0.1:6379> GET greeting
"hello"
127.0.0.1:6379> INCR visits
(integer) 1
127.0.0.1:6379> INCR visits
(integer) 2
127.0.0.1:6379> RPUSH tasks "email" "report"
(integer) 2
127.0.0.1:6379> LRANGE tasks 0 -1
1) "email"
2) "report"
```

`SET`/`GET` store and read a string. `INCR` atomically increments a counter — no read,
add-one, write-back race, because the whole command runs in one step. `RPUSH`/`LRANGE`
operate on a *list* value. Three different data structures, all reached the same way: a
command and a key.

# Real World Analogy

Think of a relational database as a **warehouse**: enormous, meticulously organized, durable,
but it takes time to walk to a shelf and back. Redis is the **workbench** right next to you:
you keep the handful of things you're using right now within arm's reach, so grabbing them is
instant. You don't store *everything* on the workbench — it's small and gets cleared — but for
the things you touch constantly, it turns a walk to the warehouse into a reach of the hand.

# Examples

## Example 1 — Basic: caching a slow lookup

Your app renders a user's profile, which requires a slow database query. The first time, you
run the query and store the result in Redis under `profile:42` with a short lifetime. Every
request for the next few minutes reads `profile:42` from Redis in microseconds instead of
hitting the database.

**Why this works:** the expensive work happens once; Redis serves the cached copy until it
expires, absorbing the load the database would otherwise take.

## Example 2 — Real-world: a live leaderboard

A game needs a top-10 scoreboard updated in real time. Storing scores in a **sorted set** lets
Redis keep players ordered by score automatically, so "give me the top 10" and "what's my
rank?" are single fast commands — something that would be awkward and slow to recompute from a
relational table on every page load.

**Why this works:** Redis's sorted-set data structure matches the problem exactly, so the
ranking is maintained incrementally instead of recalculated.

## Example 3 — Trade-off / pitfall: "let's put everything in Redis"

A team moves their entire dataset into Redis for speed and drops their database. Then the
dataset grows past available RAM, they need complex queries Redis can't express, and a crash
with a loose persistence setting loses recent writes. They've traded a well-understood durable
database for a fast store used outside its strengths.

**Why this bites:** Redis is memory-bound and models data as structures you design by hand, not
as ad-hoc queryable tables. It shines *alongside* a database far more often than *instead* of
one.

# Common Mistakes

- **"Redis is just a cache."** It's a data-structure server that is *often used* as a cache. It
  can also be a primary store and a message broker.
- **"Redis is single-threaded, so it's slow / can't use my cores."** Command execution is
  single-threaded (that's what makes commands atomic), but a single Redis instance still
  handles very high throughput, and it uses extra threads for I/O and background work. Scaling
  across cores/machines is done with multiple instances (replication/Cluster).
- **"In-memory means it always loses data on restart."** Redis can persist to disk (RDB/AOF).
  Durability is a spectrum you configure, not an on/off.
- **"Redis and Valkey are the same program."** They share ancestry and are largely compatible,
  but they are separate projects with different governance and licenses (below).

# Best Practices

- Reach for Redis when you need **speed** on data that fits in memory and maps to its
  structures; keep a durable database as your source of truth unless you've deliberately
  decided otherwise.
- Assume any single command should be **fast and small**; avoid commands that touch the whole
  keyspace or huge values on the hot path.
- Decide your **durability** needs up front (can you lose the last few seconds of writes?) and
  configure persistence accordingly — don't leave it to chance.
- Pick the **right data structure** for the job; most of Redis's power comes from that choice.

# Summary

- Redis is an **in-memory key-value store** — a "data structures over the network" server —
  used as a **cache**, a **database**, and a **message broker**.
- Its values are rich **data structures** (strings, lists, hashes, sets, sorted sets, and
  more), each with dedicated commands.
- **Command execution is single-threaded**, which makes every command **atomic**; Redis still
  uses other threads/processes for I/O and background tasks. One slow command blocks everyone.
- Redis is **in-memory first, optionally durable** via RDB and AOF persistence.
- Compared with **Memcached** (a simpler string cache) and a **relational database** (durable,
  queryable, slower per op), Redis is usually a **complement**, not a replacement.
- The ecosystem includes **Redis Open Source**, **Redis Enterprise/Cloud**, and the
  **Valkey** fork; the license has changed several times (below).

# The Redis ecosystem and licensing (read carefully — the facts matter)

Redis was created by **Salvatore Sanfilippo** (known online as *antirez*) and first released
in **2009**. For most of its life the source was under the permissive **BSD-3-Clause**
license.

The licensing then changed more than once, and it's easy to get wrong — so here is the exact
timeline:

- **Until March 2024:** Redis source was **BSD-3-Clause** (a permissive, OSI-approved
  open-source license).
- **March 2024:** Redis Ltd. relicensed to a **dual, source-available** model — the **Redis
  Source Available License v2 (RSALv2)** and the **Server Side Public License (SSPLv1)**.
  These are *source-available*, **not** OSI-approved open-source licenses. In response, the
  **Linux Foundation** created **Valkey**, a fork of Redis **7.2.4**, released under the
  permissive **BSD** license and backed by companies including AWS, Google, and Oracle.
- **November 2024:** antirez rejoined Redis Ltd.
- **May 2025, with Redis 8.0:** Redis **added the AGPLv3** — an **OSI-approved open-source
  license** — as an option. Redis is now offered under a choice of **AGPLv3, RSALv2, or
  SSPLv1**.

So, said plainly: current Redis **is** available under an open-source license again (AGPLv3),
alongside the two source-available options; the 2024–2025 period under SSPL/RSAL was *not*
OSI open source; and **Valkey** is a separate, BSD-licensed, community-governed fork that
remains highly compatible with Redis. This course teaches concepts and commands that apply to
Redis Open Source (and, for the core, to Valkey too).

# Flash Cards

Q: What does Redis keep its working data in, and why?
A: In memory (RAM), so reads and writes are extremely fast — typically well under a millisecond.

Q: Why is every individual Redis command atomic?
A: Because commands are executed one at a time in a single thread, so no two commands interleave.

Q: Does "single-threaded" mean Redis uses no other threads at all?
A: No — command *logic* is single-threaded, but Redis uses extra threads/processes for I/O and background tasks like saving and freeing memory.

Q: Name the three main roles Redis plays.
A: A cache, a (primary) database, and a message broker.

Q: How does Redis differ from Memcached in one sentence?
A: Memcached is a simple multi-threaded string cache; Redis adds rich data types, persistence, replication, scripting, and messaging.

Q: What is the current licensing situation for Redis?
A: Since Redis 8.0 (May 2025) it's tri-licensed — AGPLv3 (open source), RSALv2, or SSPLv1 — after a 2024–2025 period under only the source-available RSALv2/SSPL.

Q: What is Valkey?
A: A BSD-licensed, Linux Foundation fork of Redis 7.2.4, created in 2024 and largely compatible with Redis.

# Exercises

### Easy
Start a local Redis (or use a hosted one), open `redis-cli`, and run `PING`. You should get
`PONG`. Then run `SET hello "world"` and `GET hello`. Congratulations — you've used Redis as a
key-value store.

### Medium
In `redis-cli`, run `INCR counter` five times and then `GET counter`. Explain in one sentence
why you never had to read the value, add one, and write it back yourself — and why that matters
if two clients did this at the same time.

### Challenging
Write down one feature in an app you know (e.g. a session store, a "recently viewed" list, a
rate limiter, or a leaderboard). Decide which Redis role it uses (cache / database / broker),
sketch what the **key** might be named, and note whether losing that data on a crash would be
acceptable. Keep your notes — you'll be able to implement it by the end of the course.

# Further Reading

- Redis — *Introduction to Redis*: <https://redis.io/docs/latest/develop/get-started/>
- Redis — *Understand Redis data types*: <https://redis.io/docs/latest/develop/data-types/>
- Redis — *Redis is now available under the AGPLv3 open source license*: <https://redis.io/blog/agplv3/>
- Redis — *Licenses*: <https://redis.io/legal/licenses/>
- Valkey project: <https://valkey.io/>
