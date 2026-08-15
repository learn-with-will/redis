---
id: lesson-17
slug: pipelining-and-performance
title: "Pipelining and Performance"
level: advanced
order: 17
duration: 24
tags:
  - pipelining
  - performance
  - latency
  - slowlog
  - complexity
summary: "Make Redis fast: pipelining to eliminate round-trip latency, the single-threaded core plus optional I/O threads, diagnosing slow commands with SLOWLOG and LATENCY, benchmarking, and avoiding O(N) command traps."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Use **pipelining** to cut round-trip latency and explain how it differs from a transaction.
- Describe the **single-threaded** execution model and where **I/O threads** help.
- Diagnose slow commands with **`SLOWLOG`** and **`LATENCY`**, and benchmark with `redis-benchmark`.
- Recognize **O(N)** command traps and avoid blocking the server.

# Why It Matters

Redis is fast, but you can still make it slow — usually by paying network round trips you didn't need
or by running one heavy command that blocks everything. Because command execution is single-threaded,
performance is largely about **not making the one thread do expensive things** and **not waiting on
the network more than necessary**. A few techniques and diagnostic tools cover most of it.

# Concept Explanation

### Pipelining: stop waiting for each reply

Normally a client sends a command and **waits** for the reply before sending the next. Each such
exchange costs one **round-trip time (RTT)** — the network latency to the server and back. Do 1,000
commands one-at-a-time over a 1 ms link and you've spent ~1 second just waiting.

**Pipelining** sends many commands **back-to-back without waiting**, then reads all the replies
together. The commands still execute in order on the server, but you pay the RTT roughly **once** for
the whole batch instead of once per command. For bulk work this is often a 10×–100× throughput win.

```bash
# Feed many commands at once via a pipeline
redis-cli --pipe < commands.txt
```

Pipelining is purely a **latency** optimization: it does **not** make the commands atomic and other
clients' commands can still interleave between them. If you need atomicity, that's `MULTI`/`EXEC` or a
script — different tools. (You *can* pipeline a `MULTI`/`EXEC` to get both, but they solve different
problems.)

### The execution model: single thread + I/O threads

Redis executes **commands** in a single thread, one at a time — that's what makes each command atomic,
and it means **there is no such thing as a slow command that only affects one client**: a slow command
delays everyone. Since Redis 6, optional **I/O threads** (`io-threads`) can parallelize the
**reading/writing of data on the network sockets**, which helps when many clients send lots of data —
but the command logic itself stays single-threaded. Don't expect I/O threads to speed up an expensive
command; they speed up moving bytes, not running the command.

### Command complexity: the O(N) traps

Every command has a documented **time complexity**. On the hot path you want O(1) or O(log N) commands.
The dangerous ones scan or return large amounts of data in a single call — and because they run on the
one thread, they stall the whole server:

- `KEYS pattern` — O(N) over the whole keyspace. Use `SCAN`.
- `SMEMBERS` / `HGETALL` / `LRANGE key 0 -1` on a huge collection — O(N) in the collection. Use the
  `SCAN`-family (`SSCAN`/`HSCAN`) or fetch bounded slices.
- Big `ZRANGE`, `SORT`, or set operations over large sets.

**Big keys** (a single collection with millions of elements, or a multi-megabyte value) are a common
cause of latency spikes: any O(N) operation on them is expensive, and even deleting one can be costly
(use `UNLINK`, which frees memory in the background, instead of `DEL`). Design keys to stay bounded.

### Diagnosing slowness

- **`SLOWLOG`** — Redis records commands that took longer than `slowlog-log-slower-than` microseconds.
  `SLOWLOG GET` shows recent offenders (command, duration, timestamp); `SLOWLOG RESET` clears it. This
  is your first stop for "why did latency spike?"
- **`LATENCY`** — the latency monitor tracks spikes against `latency-monitor-threshold`; `LATENCY
  LATEST` and `LATENCY DOCTOR` summarize and advise.
- **`redis-benchmark`** — a load-testing tool that measures throughput/latency for various commands and
  pipeline depths, e.g. `redis-benchmark -q -n 100000`.
- **`INFO`** — `instantaneous_ops_per_sec`, `keyspace_hits`/`keyspace_misses` (cache hit rate), and
  memory stats give a running picture.

# Key Terminology

- **RTT (round-trip time)** — the network latency for one request/response exchange.
- **Pipelining** — sending many commands without waiting per reply; amortizes RTT. Not atomic.
- **I/O threads** — optional threads (Redis 6+) that parallelize network read/write, not command
  execution.
- **`SLOWLOG`** — a log of commands exceeding a time threshold.
- **Big key** — a single key holding a very large value/collection; a latency risk.

# Options and Trade-offs

Reducing the cost of many operations:

| Technique | Cuts | Atomic? | Use when | Watch out for |
| --------- | ---- | ------- | -------- | ------------- |
| **Pipelining** | Round-trip latency | No | Bulk independent commands | Replies buffered until read; not isolation |
| **MULTI/EXEC** | (adds isolation) | Yes | A batch must not interleave | Doesn't reduce RTT by itself |
| **Lua script** | RTT + adds atomicity | Yes | Read-compute-write logic | Blocks the server while it runs |
| **`MGET`/`MSET`/multi-arg commands** | RTT for related keys | Per-command | Fetching/setting several keys | Only for supported multi-key ops |

# Worked Example

Compare the cost model of 3 commands sent serially vs. pipelined (conceptually), then find a slow
command:

```text
# Serial: 3 round trips
SET a 1     -> OK      (wait RTT)
SET b 2     -> OK      (wait RTT)
SET c 3     -> OK      (wait RTT)

# Pipelined: ~1 round trip for all three
SET a 1
SET b 2
SET c 3
-> OK
-> OK
-> OK
```

```text
127.0.0.1:6379> CONFIG SET slowlog-log-slower-than 10000
OK
127.0.0.1:6379> SLOWLOG GET 1
1) 1) (integer) 14          # entry id
   2) (integer) 1723700000  # timestamp
   3) (integer) 42000       # microseconds it took (42 ms!)
   4) 1) "KEYS"
      2) "*"
```

The `SLOWLOG` caught a `KEYS *` that took 42 ms — a clear culprit to replace with `SCAN`. Setting the
threshold to 10,000 microseconds (10 ms) logs anything slower than that.

# Real World Analogy

Sending commands one at a time is like **mailing a letter and waiting for the reply before writing the
next** — most of your time is the mail in transit. Pipelining is **putting ten letters in one envelope**:
the round trip happens once. And the single-threaded server is a **single checkout lane**: it's very
fast per item, but if one customer dumps a cart of a million items on the belt (`KEYS *`, a giant
`SMEMBERS`), everyone behind them waits.

# Examples

## Example 1 — Basic: bulk-load with a pipeline

You need to preload 50,000 keys. Sending them one-by-one takes 50,000 round trips; piping them
(`redis-cli --pipe`) sends them in a stream and reads the replies at the end, finishing far faster.

**Why this works:** the network RTT, not Redis itself, was the bottleneck — pipelining pays it once.

## Example 2 — Real-world: find and fix a latency spike

Latency alerts fire. `SLOWLOG GET` shows repeated `HGETALL` on a hash that grew to millions of fields.
You switch the code to `HSCAN` (or restructure the data) and the spikes disappear.

**Why this works:** the slow log turns "it's slow sometimes" into a specific O(N) command you can
replace with a bounded, incremental one.

## Example 3 — Trade-off / pitfall: pipelining expecting atomicity

A developer pipelines `GET balance` then `SET balance <new>` assuming no one can interfere because
they were "sent together." Another client modifies `balance` between the two, and the update is based
on stale data.

**Why this bites:** pipelining only removes waiting; it provides **no atomicity or isolation**. That
read-compute-write needs `WATCH` or a Lua script.

# Common Mistakes

- **Chatty round-trips** for bulk work instead of pipelining or multi-key commands.
- **Assuming pipelining is atomic.** It isn't; use `MULTI`/`EXEC` or a script for atomicity.
- **Running O(N) commands on the hot path** (`KEYS`, big `HGETALL`/`SMEMBERS`/`LRANGE 0 -1`).
- **Deleting huge keys with `DEL`.** Prefer `UNLINK` to free memory in the background.
- **Ignoring `SLOWLOG`.** It's the fastest way to find what's stalling the server.

# Best Practices

- **Pipeline** bulk, independent commands; use multi-key commands (`MGET`/`MSET`) where they fit.
- Keep individual commands **O(1)/O(log N)** on the hot path; iterate big collections with the
  `SCAN` family.
- Keep keys **bounded**; treat multi-million-element collections and multi-MB values as red flags.
- Use `UNLINK` for large deletes.
- Watch `SLOWLOG` and `LATENCY`, and load-test changes with `redis-benchmark`.

# Summary

- **Pipelining** sends many commands without waiting per reply, amortizing round-trip time — a big
  throughput win, but **not atomic** (that's `MULTI`/scripts).
- Redis runs **commands single-threaded** (so slow commands block everyone); **I/O threads** (Redis
  6+) only parallelize network I/O, not command execution.
- Avoid **O(N)** traps (`KEYS`, big `HGETALL`/`SMEMBERS`/`LRANGE 0 -1`) and **big keys**; use the
  `SCAN` family and `UNLINK` for large deletes.
- Diagnose with **`SLOWLOG`** (slow commands), **`LATENCY`** (spikes), `INFO` (ops/sec, hit rate), and
  **`redis-benchmark`**.

# Flash Cards

Q: What does pipelining reduce, and does it make commands atomic?
A: It reduces round-trip latency by sending many commands without waiting for each reply; it does NOT make them atomic.

Q: In Redis 6+, what do I/O threads parallelize?
A: The reading and writing of data on network sockets — not command execution, which stays single-threaded.

Q: Why is running KEYS or a huge HGETALL on the hot path dangerous?
A: They're O(N) and run on the single command thread, so they block every other client while they scan/return everything.

Q: Which command helps you find recently slow commands?
A: SLOWLOG (SLOWLOG GET shows commands that exceeded slowlog-log-slower-than microseconds).

Q: What should you use instead of DEL to remove a very large key?
A: UNLINK, which reclaims the memory in the background instead of blocking on the free.

Q: If you pipeline GET then SET to update a value, what guarantee are you missing?
A: Atomicity/isolation — another client can change the value between them; use WATCH or a Lua script instead.

# Exercises

### Easy
Run `redis-benchmark -q -n 10000 -t set,get`. Note the requests-per-second figures. Then read the
`--pipe`/pipelining note in the redis-cli docs and describe when you'd use it.

### Medium
Set `CONFIG SET slowlog-log-slower-than 0` (logs everything briefly), run a few commands including a
`KEYS *` on a populated database, then `SLOWLOG GET`. Identify the slowest command. Reset the threshold
afterward.

### Challenging
Given a request that needs to read 100 keys, compare three designs: (a) 100 separate `GET`s, (b) one
`MGET` of 100 keys, (c) a pipeline of 100 `GET`s. Explain the round-trip cost of each and when you'd
choose each one.

# Further Reading

- Redis — *Pipelining*: <https://redis.io/docs/latest/develop/use/pipelining/>
- Redis — *SLOWLOG*: <https://redis.io/commands/slowlog-get/>
- Redis — *LATENCY* monitoring: <https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency-monitor/>
- Redis — *redis-benchmark*: <https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/>
