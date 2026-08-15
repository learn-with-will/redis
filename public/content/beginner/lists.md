---
id: lesson-04
slug: lists
title: "Lists"
level: beginner
order: 4
duration: 22
tags:
  - lists
  - queues
  - stacks
  - blocking
  - data-types
summary: "The Redis List type: an ordered sequence you push and pop from either end in O(1). Build queues, stacks, and capped 'latest-N' lists, and use blocking pops (BLPOP) for producer/consumer patterns."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Push and pop elements from both ends of a **List** with `LPUSH`/`RPUSH`/`LPOP`/`RPOP`.
- Read ranges with `LRANGE` and understand the cost of indexed access.
- Build a **queue** (FIFO), a **stack** (LIFO), and a **capped "latest-N"** list.
- Use **blocking** pops (`BLPOP`/`BRPOP`) for producer/consumer workflows.
- Move items between lists atomically with `LMOVE` / `BLMOVE`.

# Why It Matters

A List is Redis's ordered sequence, and it's the natural building block for **queues** — the
backbone of background-job systems, task pipelines, and buffers between fast producers and
slower consumers. Because pushing and popping at the ends is O(1), a Redis List makes a
fast, simple, shared queue that many workers can pull from.

# Concept Explanation

### What a List is

A Redis **List** is an ordered collection of string elements, kept as a linked list. The key
consequence: **adding or removing at either end is O(1)** (constant time, regardless of
length), while **reaching an element in the middle by index is O(N)**. So Lists are perfect
when you work at the ends and poor when you need random access into the middle.

Think of the two ends as **left** (head) and **right** (tail):

- `LPUSH key v [v ...]` — push onto the left/head.
- `RPUSH key v [v ...]` — push onto the right/tail.
- `LPOP key [count]` — pop from the left.
- `RPOP key [count]` — pop from the right.
- `LLEN key` — length.
- `LRANGE key start stop` — return a range (`0 -1` means the whole list).
- `LINDEX key i` — the element at index `i` (O(N)).
- `LREM`, `LSET`, `LINSERT`, `LTRIM` — remove, set, insert, and trim.

Push commands return the list's **new length**. Indexes can be negative: `-1` is the last
element, `-2` the second-to-last.

```text
127.0.0.1:6379> RPUSH tasks "a" "b" "c"
(integer) 3
127.0.0.1:6379> LRANGE tasks 0 -1
1) "a"
2) "b"
3) "c"
127.0.0.1:6379> LPOP tasks
"a"
```

### Queues and stacks

Combine the ends to get classic structures:

- **Queue (FIFO):** producers `RPUSH` onto the tail; consumers `LPOP` from the head. First in,
  first out.
- **Stack (LIFO):** `LPUSH` and `LPOP` on the same end. Last in, first out.

### Capped "latest-N" lists

To keep only the most recent N items (a recent-activity feed, the last 100 log lines), push
and then **trim**:

```text
127.0.0.1:6379> LPUSH recent "event-42"
(integer) 6
127.0.0.1:6379> LTRIM recent 0 99
OK
```

`LTRIM key 0 99` keeps indexes 0–99 and discards the rest, so the list never grows past 100.

### Blocking pops for producer/consumer

If a consumer calls `LPOP` on an empty queue, it just gets `(nil)` and would have to poll in a
loop — wasteful. **Blocking** versions wait efficiently until an item arrives:

- `BLPOP key [key ...] timeout` — block on the left until an element is available or `timeout`
  seconds pass (`0` = wait forever).
- `BRPOP` — same, on the right.

```text
127.0.0.1:6379> BLPOP jobs 5
1) "jobs"
2) "build-123"
```

The reply includes **which key** the element came from (useful when you block on several) and
the element itself. If the timeout elapses with nothing available, you get `(nil)`.

### Moving between lists atomically

`LMOVE source dest <LEFT|RIGHT> <LEFT|RIGHT>` pops from one list and pushes to another in a
single atomic step; `BLMOVE` is the blocking version. This underpins a **reliable queue**: move
a job from a "pending" list to a "processing" list atomically, so a job is never lost if a
worker crashes mid-handling. (`LMOVE`/`BLMOVE` replace the older `RPOPLPUSH`/`BRPOPLPUSH`.)

# Key Terminology

- **List** — an ordered sequence of strings; O(1) at the ends, O(N) in the middle.
- **Head / tail (left / right)** — the two ends you push and pop from.
- **FIFO / LIFO** — first-in-first-out (queue) / last-in-first-out (stack).
- **Blocking pop** — a pop that waits for an element instead of returning nil immediately.
- **Capped list** — a list kept to a maximum length by trimming after each push.

# Options and Trade-offs

Choosing how to consume a Redis-backed queue:

| Option | What it does | Use when | Watch out for |
| ------ | ------------ | -------- | ------------- |
| **`LPOP` in a poll loop** | Repeatedly checks for work | Simple, low-volume | Wastes CPU/round trips when idle |
| **`BLPOP`/`BRPOP`** | Blocks until an item arrives | Efficient producer/consumer | Ties up a connection while waiting |
| **`LMOVE`/`BLMOVE` to a processing list** | Atomically reserves a job | You must not lose a job if a worker dies | Slightly more bookkeeping (clear the processing list) |
| **Streams (later lesson)** | Durable log + consumer groups | You need acks, replay, or many consumers | More concepts than a plain list |

# Worked Example

A background-job queue: producers add jobs to the tail, a worker blocks for the next one.

```text
# Producer
127.0.0.1:6379> RPUSH jobs "resize:img-1" "resize:img-2"
(integer) 2

# Worker (blocks up to 30s for the next job)
127.0.0.1:6379> BLPOP jobs 30
1) "jobs"
2) "resize:img-1"
127.0.0.1:6379> BLPOP jobs 30
1) "jobs"
2) "resize:img-2"
127.0.0.1:6379> BLPOP jobs 5
(nil)
```

The worker pulls jobs in the order they were pushed (FIFO), then — when the queue empties —
waits up to 5 seconds and gets `(nil)` when nothing arrives.

# Real World Analogy

A Redis List used as a queue is a **conveyor belt** at a warehouse. Workers upstream place
boxes on the right end (`RPUSH`); packers downstream take boxes off the left end (`LPOP`).
`BLPOP` is a packer who, instead of repeatedly glancing at an empty belt, simply waits at their
station and grabs the next box the instant it slides down.

# Examples

## Example 1 — Basic: an activity feed of the last 50 actions

`LPUSH feed:user:7 "liked post 9"` then `LTRIM feed:user:7 0 49` after each action. The newest
action is always at index 0, and the feed never exceeds 50 entries.

**Why this works:** pushing to the head keeps newest-first order, and trimming caps memory use
regardless of how active the user is.

## Example 2 — Real-world: sharing work across many workers

Ten worker processes all call `BLPOP jobs 0` on the same list. When a producer `RPUSH`es a job,
exactly one blocked worker receives it. You've built a simple, fair work distributor with two
commands and no coordination code.

**Why this works:** each element is delivered to exactly one popper, so the list naturally load-
balances across consumers.

## Example 3 — Trade-off / pitfall: treating a List like an array

Code stores 1,000,000 items in a list and reads element 500,000 with `LINDEX` on every request.
Each `LINDEX` walks halfway down the list — O(N) — and these calls pile up, stalling the server.

**Why this bites:** Lists are optimized for the ends, not random middle access. If you need
indexed lookups, a different structure (or a different key design) fits better.

# Common Mistakes

- **Polling with `LPOP` in a tight loop.** Use `BLPOP`/`BRPOP` to wait efficiently instead.
- **Random access with `LINDEX`/`LSET` on big lists.** These are O(N); Lists aren't arrays.
- **Forgetting to cap a growing list.** Without `LTRIM`, a "recent items" list grows without
  bound and eats memory.
- **Losing in-flight jobs on a crash.** A plain `LPOP` removes the job before it's done; use
  `LMOVE` to a processing list for reliability.

# Best Practices

- Use `RPUSH` + `LPOP` for a FIFO queue; `LPUSH` + `LPOP` for a LIFO stack — pick one direction
  and be consistent.
- Cap "latest-N" lists with `LTRIM` right after each push.
- Prefer **blocking** pops for consumers so idle workers don't burn round trips.
- For jobs that must not be lost, reserve them with `LMOVE`/`BLMOVE` into a processing list and
  remove them only after success.

# Summary

- A **List** is an ordered string sequence: **O(1)** push/pop at the ends, **O(N)** for middle
  access.
- `LPUSH`/`RPUSH` add (returning the new length); `LPOP`/`RPOP` remove; `LRANGE key 0 -1` reads
  all; negative indexes count from the end.
- Build **queues** (`RPUSH`+`LPOP`), **stacks** (`LPUSH`+`LPOP`), and **capped** lists
  (`LPUSH`+`LTRIM`).
- **`BLPOP`/`BRPOP`** block until an element is available — efficient producer/consumer.
- **`LMOVE`/`BLMOVE`** move an element between lists atomically, enabling reliable queues.

# Flash Cards

Q: What is the time complexity of pushing/popping at the ends of a List versus indexed middle access?
A: O(1) at the ends (LPUSH/RPUSH/LPOP/RPOP); O(N) for middle access (LINDEX/LSET).

Q: How do you build a FIFO queue with a Redis List?
A: Producers RPUSH onto the tail; consumers LPOP from the head (first in, first out).

Q: How do you keep only the most recent 100 items in a list?
A: LPUSH the new item, then LTRIM key 0 99 to discard everything past index 99.

Q: What advantage does BLPOP have over LPOP for a worker?
A: BLPOP blocks and waits for an element (up to a timeout) instead of returning nil immediately, so idle workers don't poll.

Q: What does LMOVE give you that LPOP does not?
A: It pops from one list and pushes to another atomically, so a reserved job isn't lost if a worker crashes mid-processing.

Q: In `LRANGE key 0 -1`, what does -1 mean?
A: The last element — negative indexes count from the end of the list.

# Exercises

### Easy
`RPUSH letters a b c d`, then `LRANGE letters 0 -1` to see them, `LPOP letters` twice, and
`LLEN letters`. Confirm the order they came off matches FIFO.

### Medium
Build a capped feed: `LPUSH feed x` five times with different values, then `LTRIM feed 0 2`.
Run `LRANGE feed 0 -1` and explain which items survived and why.

### Challenging
Open two `redis-cli` sessions. In one, run `BLPOP jobs 0` (it blocks). In the other, `RPUSH
jobs "hello"`. Watch the first session unblock and receive the job. Then sketch how you'd use
`LMOVE jobs processing LEFT RIGHT` to make the job recoverable if the worker died before
finishing.

# Further Reading

- Redis — *Redis Lists*: <https://redis.io/docs/latest/develop/data-types/lists/>
- Redis — *LPUSH* / *RPUSH* / *LRANGE*: <https://redis.io/commands/lpush/>
- Redis — *BLPOP*: <https://redis.io/commands/blpop/>
- Redis — *LMOVE*: <https://redis.io/commands/lmove/>
