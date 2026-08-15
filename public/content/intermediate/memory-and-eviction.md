---
id: lesson-15
slug: memory-and-eviction
title: "Memory and Eviction"
level: intermediate
order: 15
duration: 22
tags:
  - memory
  - eviction
  - maxmemory
  - lru
  - lfu
summary: "Bounding Redis memory with maxmemory and the eight eviction policies (noeviction, allkeys-*, volatile-*). Why LRU and LFU are approximated by sampling, and how to pick a policy for a cache versus mixed data."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Set a memory ceiling with **`maxmemory`** and understand what happens when it's reached.
- Name the **eight eviction policies** and explain the `allkeys-*` vs `volatile-*` split.
- Explain why **LRU** and **LFU** are **approximated**, not exact.
- Choose a policy for a **cache** versus a store holding data you can't lose.
- Inspect memory with `INFO memory` and `MEMORY USAGE`.

# Why It Matters

Redis lives in RAM, and RAM is finite. Without a plan, a growing dataset either gets your process
killed by the operating system or fills up and starts rejecting writes. **Eviction** lets Redis stay
within a memory budget by automatically removing keys when it's full — but *which* keys it removes
depends on a policy you must choose deliberately. Get it right and Redis is a self-managing cache;
get it wrong and you either lose data you needed or reject writes you wanted.

# Concept Explanation

### The memory ceiling: `maxmemory`

`maxmemory` sets the maximum memory Redis will use for data (e.g. `maxmemory 512mb`). The important
default: **`maxmemory 0` means no limit** — Redis will keep allocating until the OS runs out and
(likely) kills it. In production you almost always set a real limit.

What happens when Redis reaches the limit is decided by **`maxmemory-policy`**.

### Expiration vs. eviction (recap)

These are different, and it's worth restating: **expiration** removes a key when *its own TTL* is due.
**Eviction** removes keys because Redis hit **`maxmemory`** and needs room — and, depending on the
policy, it may remove keys that have **no TTL at all**. Expiration is a per-key deadline you set;
eviction is memory-pressure cleanup governed by a policy.

### The eight eviction policies

When `maxmemory` is reached and a new write needs space, the policy decides what to do:

| Policy | What it evicts |
| ------ | -------------- |
| **`noeviction`** (default) | Nothing — new writes get an OOM error; reads still work |
| **`allkeys-lru`** | The least-recently-used key, from *all* keys |
| **`allkeys-lfu`** | The least-frequently-used key, from *all* keys |
| **`allkeys-random`** | A random key, from *all* keys |
| **`volatile-lru`** | Least-recently-used, but only among keys **with a TTL** |
| **`volatile-lfu`** | Least-frequently-used, only among keys with a TTL |
| **`volatile-random`** | A random key, only among keys with a TTL |
| **`volatile-ttl`** | The key with a TTL **closest to expiring** |

Two things to burn in:

- The default is **`noeviction`** — Redis would rather **reject writes** (with an OOM error) than
  delete your data. That's safe for a datastore but wrong for a cache (where you'd want it to make
  room).
- **`volatile-*`** policies only consider keys that have a TTL. If memory is full and **no** key has
  a TTL, a `volatile-*` policy has nothing to evict and behaves like `noeviction` — writes start
  failing. So `volatile-*` only works if you actually set TTLs.

### Why LRU and LFU are approximate

- **LRU (Least Recently Used)** evicts whatever hasn't been touched for the longest time.
- **LFU (Least Frequently Used)**, added in Redis 4.0, evicts whatever is accessed least often (with
  a decay so old popularity fades) — better when some keys are consistently hot.

Crucially, Redis does **not** track perfect LRU/LFU order for every key (that would cost too much
memory and time). Instead it **samples** a handful of keys and evicts the best candidate among them.
The sample size is `maxmemory-samples` (default around 5); larger samples approximate true LRU/LFU
more closely at a little more CPU. So "LRU" in Redis means "a good approximation of LRU," not an exact
ordering.

### Seeing memory usage

- `INFO memory` — `used_memory`, `maxmemory`, `maxmemory_policy`, fragmentation, and more.
- `MEMORY USAGE key` — approximate bytes a specific key consumes.
- `MEMORY DOCTOR` — a human-readable health assessment; `MEMORY STATS` — detailed breakdown.

# Key Terminology

- **`maxmemory`** — the memory ceiling for data (`0` = unlimited).
- **Eviction** — removing keys under `maxmemory` pressure per a policy (distinct from expiration).
- **`maxmemory-policy`** — which keys to evict when full (the eight policies above).
- **LRU / LFU** — evict least-recently- / least-frequently-used; both **approximated by sampling**.
- **OOM error** — the out-of-memory error a write gets under `noeviction` when full.

# Options and Trade-offs

Choosing a policy for your workload:

| Situation | Good policy | Why |
| --------- | ----------- | --- |
| **Pure cache** (all keys expendable) | `allkeys-lru` or `allkeys-lfu` | Evict cold/rare keys to keep hot data; `lfu` favors consistently popular keys |
| **Cache + some must-keep data**, all cache keys have TTLs | `volatile-lru` / `volatile-lfu` | Only expire the TTL'd cache keys, never the permanent data |
| **Datastore that must not silently drop keys** | `noeviction` | Reject writes instead of deleting data — but you must size RAM and monitor |
| **Time-sensitive cache** | `volatile-ttl` | Drop the soonest-to-expire first |

# Worked Example

Set a small limit and an eviction policy, then observe the settings via `INFO`:

```text
127.0.0.1:6379> CONFIG SET maxmemory 100mb
OK
127.0.0.1:6379> CONFIG SET maxmemory-policy allkeys-lru
OK
127.0.0.1:6379> INFO memory
# Memory
used_memory_human:1.20M
maxmemory:104857600
maxmemory_human:100.00M
maxmemory_policy:allkeys-lru
127.0.0.1:6379> MEMORY USAGE greeting
(integer) 72
```

Redis now caps data at 100 MB and, when full, evicts approximately-least-recently-used keys from the
whole keyspace. `MEMORY USAGE` shows a single key's footprint. Had the policy stayed `noeviction`,
writes would start returning OOM errors at the limit instead.

# Real World Analogy

`maxmemory` is the size of your **desk**. When it fills up, the **eviction policy** is your rule for
what to clear: `allkeys-lru` tosses the paper you haven't touched in longest; `allkeys-lfu` tosses
the paper you reach for least often; `volatile-ttl` clears the sticky notes nearest their throw-away
date; `noeviction` refuses to add anything new until *you* clear space. And you don't audit every
sheet to decide — you glance at a few (`maxmemory-samples`) and clear the best candidate. It's a good
approximation, not a perfect ranking.

# Examples

## Example 1 — Basic: a cache that self-manages

Set `maxmemory 2gb` and `maxmemory-policy allkeys-lru`. As new cache entries arrive and memory fills,
Redis quietly evicts the coldest keys, so hot data stays and the cache never overflows.

**Why this works:** for a cache, any key is expendable, so evicting the least-recently-used keeps the
useful ones and bounds memory automatically.

## Example 2 — Real-world: mixed cache and config data

Permanent config keys have no TTL; cache keys all have TTLs. With `volatile-lru`, eviction only ever
targets the TTL'd cache keys, never the config — so a memory spike can't erase configuration.

**Why this works:** the `volatile-*` family restricts eviction to keys you've explicitly marked
disposable with a TTL.

## Example 3 — Trade-off / pitfall: `volatile-lru` with no TTLs

A team sets `volatile-lru` but never sets TTLs on their cache keys. Memory fills, but there are no
TTL'd keys to evict, so Redis behaves like `noeviction` and starts rejecting writes with OOM errors —
the opposite of what they wanted.

**Why this bites:** `volatile-*` can only evict keys that have a TTL. Without TTLs, it has no
candidates. Either set TTLs or switch to an `allkeys-*` policy.

# Common Mistakes

- **Leaving `maxmemory` at 0 in production.** No limit means the OS may kill Redis when RAM runs out.
- **Forgetting the default is `noeviction`.** A cache under `noeviction` starts erroring on writes when
  full instead of making room.
- **Using `volatile-*` without setting TTLs.** No eligible keys → behaves like `noeviction`.
- **Assuming exact LRU/LFU.** They're sampled approximations; tune `maxmemory-samples` if you need
  closer behavior.

# Best Practices

- Always set a real **`maxmemory`** in production, sized with headroom for overhead and background
  saves.
- For a **cache**, use `allkeys-lru` (or `allkeys-lfu` when popularity is stable); for **mixed**
  data with TTLs on cache keys, use `volatile-*`; for a **must-keep** store, use `noeviction` and
  monitor memory.
- If you choose a `volatile-*` policy, make sure the disposable keys actually **have TTLs**.
- Watch `used_memory` vs `maxmemory` (via `INFO memory`) and alert before you hit the ceiling.

# Summary

- **`maxmemory`** caps data memory; **`0` = unlimited** (risking an OS kill). The behavior at the
  limit is set by **`maxmemory-policy`**.
- **Eviction ≠ expiration**: eviction is memory-pressure cleanup and can remove keys without TTLs.
- The **eight policies**: `noeviction` (default — reject writes), `allkeys-lru/lfu/random`, and
  `volatile-lru/lfu/random/ttl`. **`volatile-*` only evicts keys with a TTL** (else it acts like
  `noeviction`).
- **LRU/LFU are approximated** by sampling (`maxmemory-samples`), not exact.
- Pick by workload: `allkeys-lru`/`lfu` for a cache, `volatile-*` for mixed data, `noeviction` for a
  must-keep store.

# Flash Cards

Q: What does maxmemory 0 mean?
A: No memory limit — Redis keeps allocating until the OS runs out (and likely kills the process). Set a real limit in production.

Q: What is the default maxmemory-policy, and what does it do when full?
A: noeviction — it rejects new writes with an OOM error (reads still work) rather than deleting any data.

Q: What's the difference between allkeys-* and volatile-* eviction policies?
A: allkeys-* can evict any key; volatile-* only evict keys that have a TTL (and act like noeviction if none do).

Q: Are Redis's LRU and LFU exact?
A: No — they're approximated by sampling a few keys (maxmemory-samples) and evicting the best candidate, to save memory and CPU.

Q: What's the risk of choosing volatile-lru but setting no TTLs?
A: There are no eligible keys to evict, so Redis behaves like noeviction and starts rejecting writes when memory is full.

Q: Which policy would you pick for a pure cache, and why?
A: allkeys-lru (or allkeys-lfu) — every key is expendable, so evicting the coldest/least-popular keeps hot data and bounds memory.

# Exercises

### Easy
`CONFIG GET maxmemory` and `CONFIG GET maxmemory-policy` to see the current settings. Then `CONFIG SET
maxmemory 50mb` and confirm with `INFO memory` that `maxmemory` changed.

### Medium
Set `maxmemory-policy allkeys-lru`. Explain, in your own words, what Redis will do when it hits the
memory limit and a client sends a new `SET` — and how that differs from the `noeviction` default.

### Challenging
You run a mixed instance: permanent feature-flag keys (no TTL) and cache keys (all with TTLs). Choose
an eviction policy so that a memory spike can never delete a feature flag, and explain what would go
wrong if you forgot to put TTLs on the cache keys.

# Further Reading

- Redis — *Key eviction* (maxmemory and the policies): <https://redis.io/docs/latest/develop/reference/eviction/>
- Redis — *Memory optimization*: <https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/>
- Redis — *MEMORY USAGE*: <https://redis.io/commands/memory-usage/>
