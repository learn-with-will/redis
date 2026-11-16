---
slug: blocking-list-pops
title: Producer-Consumer Queues with BLPOP and BRPOP
topic: lists-and-hashes
kind: pattern
summary: Build efficient background worker job queues without polling CPU spinlocks using blocking commands BLPOP and BRPOP.
tags:
  - queues
  - blpop
  - brpop
  - blocking
  - worker
related:
  - list-data-structure-basics
  - capped-lists-with-ltrim
  - consumer-groups-and-distributed-workers
---
> **In one line:** `BLPOP` and `BRPOP` block client connections until a new item arrives in a list, creating efficient push queues.

## The idea

When building distributed background job queues, worker processes must consume new tasks as soon as producers create them. If workers use standard `LPOP`, they must loop continuously, querying Redis hundreds of times per second (`busy-waiting` or polling) to check for work. Polling wastes CPU cycles, increases network latency, and degrades server throughput.

Redis provides **blocking pop commands** (`BLPOP`, `BRPOP`, and `BLMOVE`). When a worker calls `BLPOP` on an empty list, Redis pauses the client connection. As soon as a producer pushes an item, Redis wakes the blocked worker and delivers the payload instantly.

| Command | Direction | Behavior on Empty List | Behavior on Arrival |
|---|---|---|---|
| `LPOP key` | Non-blocking | Returns `nil` immediately | Pops element |
| `BLPOP key [key ...] timeout` | Left / Head | Blocks connection until timeout or element pushed | Pops element immediately |
| `BRPOP key [key ...] timeout` | Right / Tail | Blocks connection until timeout or element pushed | Pops element immediately |
| `BLMOVE src dst ...` | Atomic Transfer | Blocks until source list has item, moves to destination | Reliable queue processing |

> **Tip:** Setting `timeout 0` blocks indefinitely until an item is pushed; specifying a positive integer (e.g., `timeout 5`) unblocks after that many seconds, returning `nil`.

## See it

Simulating a producer-consumer background queue in `redis-cli`:

```bash
# In Worker Terminal 1: Wait for a job on "tasks:critical" or "tasks:default"
# Timeout set to 30 seconds
BLPOP tasks:critical tasks:default 30

# In Producer Terminal 2: Push a new high-priority job
LPUSH tasks:critical "process_payment_994"

# Worker Terminal 1 immediately wakes and receives:
# 1) "tasks:critical"        <-- Name of list that satisfied the pop
# 2) "process_payment_994"   <-- The delivered task payload

# Safely moving tasks between queues for reliable processing
LPUSH tasks:pending "job_99"
BLMOVE tasks:pending tasks:processing RIGHT LEFT 5
# Returns: "job_99"
```

Notice that `BLPOP` accepts multiple list keys, allowing workers to implement priority queues by checking `tasks:critical` before `tasks:default`.

## Go deeper

When multiple worker clients block on the same list key, Redis serves them in strict **FIFO order** (First-In-First-Out by arrival time of the blocking request).

For mission-critical queues where workers might crash halfway through job execution, use `BLMOVE` (or legacy `BRPOPLPUSH`) to atomically move the item from `tasks:pending` into a `tasks:processing` list. If the worker crashes, the job remains in the processing list for reconciliation.

## Watch out

- Long-lived blocking connections can be silently dropped by intermediate stateful firewalls or cloud NAT gateways; configure `tcp-keepalive` in `redis.conf`.
- When using connection pools, ensure blocking connections do not starve other threads needing connections for quick reads.

## Remember

- `BLPOP` and `BRPOP` eliminate wasteful busy-wait polling by blocking until items arrive.
- Passing multiple keys implements multi-level queue priority handling.
- When multiple workers are waiting on the same key, Redis wakes them in arrival order.
