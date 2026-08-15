---
id: lesson-22
slug: observability-and-operations
title: "Observability and Operations"
level: advanced
order: 22
duration: 22
tags:
  - observability
  - monitoring
  - operations
  - info
  - keyspace-notifications
summary: "Running Redis day to day: reading INFO metrics (hit rate, memory, evictions), using MONITOR/SLOWLOG/LATENCY safely, keyspace notifications, CLIENT commands, backups and rolling upgrades, and the common production pitfalls."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Read the key **`INFO`** metrics: memory, hit rate, evictions, clients, ops/sec.
- Use **`MONITOR`**, **`SLOWLOG`**, and **`LATENCY`** appropriately (and safely).
- Enable **keyspace notifications** and manage connections with **`CLIENT`** commands.
- Take **backups** and perform a **rolling upgrade**, and avoid common pitfalls.

# Why It Matters

A Redis you can't see into is a Redis waiting to surprise you — a silent memory climb, a creeping miss
rate, a slow command dragging latency. Operating Redis well means watching the right signals, having safe
tools to inspect a live server, and following routines for backups and upgrades that don't cause an
outage. This lesson is the operator's toolkit.

# Concept Explanation

### INFO: your dashboard in one command

`INFO` returns grouped sections of status and statistics. The metrics that matter most day to day:

- **Memory** — `used_memory` (and `used_memory_human`), `maxmemory`, and `mem_fragmentation_ratio`
  (how much more RSS the process uses than the data needs; well above ~1.5 can signal fragmentation).
- **Hit rate** — `keyspace_hits` and `keyspace_misses`. Their ratio is your **cache hit rate**; a
  falling hit rate often means TTLs are too short, the working set outgrew memory, or eviction is
  churning.
- **Evictions & expirations** — `evicted_keys` (keys removed by the eviction policy — rising numbers
  mean memory pressure) and `expired_keys`.
- **Clients & load** — `connected_clients`, `blocked_clients` (waiting on blocking commands),
  `rejected_connections`, and `instantaneous_ops_per_sec`.
- **Persistence & replication** — last save status, AOF state, replica offsets/lag (from earlier
  lessons).

`INFO <section>` (e.g. `INFO memory`, `INFO stats`) returns just one section. Most monitoring systems
scrape these values.

### Inspecting a live server — carefully

- **`MONITOR`** streams **every command** the server processes in real time. It's invaluable for
  "what is my app actually sending?" — but it has **significant overhead** and can slow a busy server.
  Use it briefly for debugging and **never leave it running** in production.
- **`SLOWLOG`** (from the performance lesson) lists commands that exceeded a time threshold — the safe
  way to find slow operations without `MONITOR`'s cost.
- **`LATENCY`** tracks latency spikes and `LATENCY DOCTOR` offers advice.

### Keyspace notifications

Redis can publish events when keys change, via **keyspace notifications**. Enable them with the
`notify-keyspace-events` config, then subscribe (Pub/Sub) to special channels: `__keyspace@0__:<key>`
reports events **on a key**, and `__keyevent@0__:<event>` reports **which keys** a given event happened
to (e.g. `expired`, `del`, `set`). This lets an app react to changes — for instance, running logic when
a key **expires**. Note these ride on Pub/Sub, so they inherit its fire-and-forget nature (a
disconnected listener misses events).

### Managing connections with CLIENT

The `CLIENT` family inspects and controls connections:

- `CLIENT LIST` / `CLIENT INFO` — see connected clients (address, age, last command, memory).
- `CLIENT SETNAME` / `CLIENT GETNAME` — label a connection for easier debugging.
- `CLIENT KILL` — disconnect a misbehaving client.
- `CLIENT NO-EVICT` / `CLIENT NO-TOUCH` — control a connection's interaction with eviction/LRU.

### Backups and upgrades

- **Backups** — copy the **RDB** file (`dump.rdb`); a `BGSAVE` produces a fresh, consistent snapshot to
  copy. Store backups off the Redis host. (AOF files can be backed up too.)
- **Rolling upgrade** — to upgrade with minimal downtime: upgrade a **replica** first, verify it,
  **fail over** so it becomes primary (via Sentinel/Cluster), then upgrade the old primary (now a
  replica). This avoids a full outage.

# Key Terminology

- **`INFO`** — grouped server metrics (memory, stats, clients, persistence, replication…).
- **Hit rate** — `keyspace_hits / (hits + misses)`; how often reads find a cached value.
- **`evicted_keys`** — count of keys removed by the eviction policy (a memory-pressure signal).
- **`MONITOR`** — real-time stream of all commands; high overhead, debugging only.
- **Keyspace notifications** — Pub/Sub events emitted on key changes/expiry.

# Options and Trade-offs

Choosing a tool to answer "what's happening right now?":

| Tool | Tells you | Cost | Use when |
| ---- | --------- | ---- | -------- |
| **`INFO`** | Aggregate metrics (memory, hit rate, evictions) | Cheap | Continuous monitoring/alerting |
| **`SLOWLOG`** | Which commands were slow | Cheap | Latency investigation |
| **`LATENCY`** | Latency spike sources | Cheap | Diagnosing jitter |
| **`MONITOR`** | Every command, live | **High** | Short, targeted debugging only |
| **Keyspace notifications** | App-level reaction to key events | Pub/Sub overhead | Event-driven logic (with loss caveats) |

# Worked Example

Check the cache hit rate and eviction pressure, and label a connection:

```text
127.0.0.1:6379> INFO stats
# Stats
total_connections_received:1500
instantaneous_ops_per_sec:2200
keyspace_hits:98000
keyspace_misses:2000
evicted_keys:0
expired_keys:1200
127.0.0.1:6379> CLIENT SETNAME worker-3
OK
127.0.0.1:6379> CLIENT GETNAME
"worker-3"
```

Here the hit rate is `98000 / (98000 + 2000)` = **98%** — healthy — and `evicted_keys:0` means no
memory-pressure eviction. If `evicted_keys` were climbing and the hit rate falling, you'd suspect the
working set has outgrown `maxmemory`. Naming the connection makes it easy to spot in `CLIENT LIST`.

# Real World Analogy

Operating Redis is like running the **control room of a power plant**. `INFO` is the wall of gauges you
watch continuously (load, temperature, output). `SLOWLOG`/`LATENCY` are the fault log you check when a
gauge twitches. `MONITOR` is opening an inspection hatch to watch the turbine directly — useful for a
moment, but you don't leave it open while running at full load. **Backups** are keeping spare parts and
blueprints off-site; a **rolling upgrade** is swapping one generator at a time so the lights never go
out.

# Examples

## Example 1 — Basic: watch the hit rate

A monitoring system scrapes `keyspace_hits`/`keyspace_misses` from `INFO stats` every minute and graphs
the hit rate. A sudden drop alerts the team that caching effectiveness fell — before users feel the
slowdown.

**Why this works:** the hit rate is a leading indicator of cache health, and `INFO` exposes it cheaply
and continuously.

## Example 2 — Real-world: react to expiring keys

An app enables `notify-keyspace-events` for expired events and subscribes to
`__keyevent@0__:expired`. When a session key expires, the app receives the event and cleans up related
state automatically.

**Why this works:** keyspace notifications turn key lifecycle changes into events the application can act
on. (It pairs this with a periodic sweep, since Pub/Sub can drop events on disconnect.)

## Example 3 — Trade-off / pitfall: leaving MONITOR running

During an incident an engineer starts `MONITOR` to watch traffic — and forgets to stop it. On a busy
server, streaming every command adds noticeable overhead and makes the latency problem worse.

**Why this bites:** `MONITOR` copies every command to your connection, which is costly at high throughput.
Use it briefly, then rely on `SLOWLOG`/`INFO` for ongoing observation.

# Common Mistakes

- **Leaving `MONITOR` on in production.** High overhead; use it briefly and prefer `SLOWLOG`/`INFO`.
- **Not watching evictions and hit rate.** Rising `evicted_keys` and a falling hit rate signal memory
  pressure before users notice.
- **Backing up on the live host only.** Copy RDB snapshots **off-box**; a host failure shouldn't take
  the backups with it.
- **Big-bang upgrades.** Upgrade replicas first and fail over for a **rolling** upgrade instead of an
  outage.
- **Assuming keyspace notifications are reliable.** They're Pub/Sub — a disconnected listener misses
  events.

# Best Practices

- Continuously monitor `INFO` metrics: **memory**, **hit rate**, **evictions**, **connected/blocked
  clients**, **ops/sec**, and replication lag; alert on trends.
- Investigate latency with **`SLOWLOG`** and **`LATENCY`**; use **`MONITOR`** only briefly.
- Take regular **RDB backups** (via `BGSAVE`) and store them **off-host**; test restores.
- Do **rolling upgrades** (replica-first, then fail over) to avoid downtime.
- Watch for **big keys** and **unbounded structures**, and always set **`maxmemory`** with a policy.

# Summary

- **`INFO`** is your dashboard: watch **memory**, **hit rate** (`keyspace_hits`/`misses`),
  **`evicted_keys`**, **clients**, and **ops/sec**.
- **`MONITOR`** streams all commands (high overhead — debugging only); **`SLOWLOG`**/**`LATENCY`** are
  the safe ways to find slow operations and spikes.
- **Keyspace notifications** emit Pub/Sub events on key changes/expiry (with fire-and-forget caveats);
  **`CLIENT`** commands inspect and control connections.
- **Back up** RDB snapshots off-host; perform **rolling upgrades** (replica-first, then fail over).
- Watch for **big keys**, **unbounded growth**, and always configure **`maxmemory`**.

# Flash Cards

Q: Which INFO metrics tell you the cache hit rate?
A: keyspace_hits and keyspace_misses — the hit rate is hits / (hits + misses).

Q: What does a rising evicted_keys count indicate?
A: Memory pressure — Redis is evicting keys to stay under maxmemory, often alongside a falling hit rate.

Q: Why should MONITOR only be used briefly?
A: It streams every command the server processes, which adds significant overhead and can slow a busy server — never leave it running in production.

Q: What do keyspace notifications let you do, and what's the caveat?
A: React to key changes/expiry via Pub/Sub events (e.g. __keyevent@0__:expired); the caveat is they're fire-and-forget, so a disconnected listener misses events.

Q: How do you take a consistent backup of Redis data?
A: Run BGSAVE to produce a fresh RDB snapshot and copy the dump.rdb file off-host (AOF files can also be backed up).

Q: How do you perform a rolling upgrade with minimal downtime?
A: Upgrade a replica first, verify it, fail over so it becomes primary, then upgrade the old primary (now a replica).

# Exercises

### Easy
Run `INFO stats` and locate `keyspace_hits` and `keyspace_misses`. Compute the hit rate. Then run `INFO
memory` and note `used_memory_human` and `maxmemory`.

### Medium
Enable expired-key notifications (`CONFIG SET notify-keyspace-events Ex`), subscribe to
`__keyevent@0__:expired` in one `redis-cli`, and in another set a key with a 5-second TTL. Watch the
event fire when it expires, and explain one reason you'd still add a periodic cleanup sweep.

### Challenging
Write a short runbook for a "Redis memory is climbing" alert: which `INFO` metrics you'd check (memory,
evictions, hit rate, big keys), how you'd find a big key safely (without `KEYS`), and two possible root
causes with their fixes.

# Further Reading

- Redis — *INFO*: <https://redis.io/commands/info/>
- Redis — *Keyspace notifications*: <https://redis.io/docs/latest/develop/use/keyspace-notifications/>
- Redis — *MONITOR*: <https://redis.io/commands/monitor/>
- Redis — *CLIENT LIST*: <https://redis.io/commands/client-list/>
