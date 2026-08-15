---
id: lesson-11
slug: streams
title: "Streams"
level: intermediate
order: 11
duration: 26
tags:
  - streams
  - consumer-groups
  - event-log
  - messaging
  - at-least-once
summary: "The Redis Stream: a persistent, append-only log of entries you can replay by ID. Learn XADD/XREAD/XRANGE, consumer groups (XREADGROUP/XACK) for at-least-once processing, and how Streams compare to Pub/Sub and Lists."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Append and read log entries with `XADD`, `XLEN`, `XRANGE`, and `XREAD`.
- Explain stream **entry IDs** and how `*` auto-generates them.
- Use **consumer groups** (`XGROUP`, `XREADGROUP`, `XACK`) for at-least-once processing.
- Recover stuck messages with the **pending entries list** and `XCLAIM` / `XAUTOCLAIM`.
- Choose between **Streams**, **Pub/Sub**, and **Lists** for a messaging problem.

# Why It Matters

A **Stream** is Redis's most capable messaging structure: a durable, append-only log — like a
miniature Kafka inside Redis. Unlike Pub/Sub, entries are **stored** and can be **replayed**;
unlike a plain List queue, Streams support **consumer groups** so a team of workers can split a
workload with **acknowledgements** and automatic recovery of failed work. When you need an event
log or a reliable work queue, Streams are the tool.

# Concept Explanation

### Appending entries

Each **entry** in a stream has an **ID** and a set of **field-value pairs** (like a small hash).
You append with `XADD`, usually letting Redis generate the ID by passing `*`:

```text
127.0.0.1:6379> XADD orders * item "book" qty 2
"1723700000000-0"
127.0.0.1:6379> XADD orders * item "pen" qty 5
"1723700000050-0"
127.0.0.1:6379> XLEN orders
(integer) 2
```

An ID looks like `1723700000000-0`: a **millisecond timestamp**, a dash, and a **sequence number**
for entries created within the same millisecond. IDs always **increase**, so the stream is
strictly ordered and you can address any point in time.

### Reading entries

- `XRANGE key start end [COUNT n]` — entries in an ID range; `-` and `+` mean the smallest and
  largest possible IDs, so `XRANGE orders - +` reads everything. `XREVRANGE` reads newest-first.
- `XREAD [COUNT n] [BLOCK ms] STREAMS key id` — read entries **after** a given ID. The special ID
  `$` means "only entries that arrive **after** now," and `BLOCK` waits for them.

```text
127.0.0.1:6379> XRANGE orders - + COUNT 10
1) 1) "1723700000000-0"
   2) 1) "item"
      2) "book"
      3) "qty"
      4) "2"
2) 1) "1723700000050-0"
   2) 1) "item"
      2) "pen"
      3) "qty"
      4) "5"
```

Because entries persist, a consumer can re-read history at any time — the key difference from
Pub/Sub.

### Consumer groups: sharing work reliably

`XREAD` alone fans the same entries out to every reader. A **consumer group** instead lets several
**consumers** *divide* a stream's entries among themselves, each entry going to **one** consumer,
with tracking so nothing is silently lost.

1. Create the group: `XGROUP CREATE orders workers $` (start from new entries; use `0` to start
   from the beginning; add `MKSTREAM` to create the stream too).
2. Consumers read new entries with `XREADGROUP GROUP workers <consumer> COUNT n STREAMS orders >`.
   The special ID `>` means "messages never delivered to any consumer in this group."
3. A delivered-but-unacknowledged entry sits in the group's **Pending Entries List (PEL)**. The
   consumer signals success with `XACK orders workers <id>`, which removes it from the PEL.

```text
127.0.0.1:6379> XGROUP CREATE orders workers 0
OK
127.0.0.1:6379> XREADGROUP GROUP workers alice COUNT 1 STREAMS orders >
1) 1) "orders"
   2) 1) 1) "1723700000000-0"
         2) 1) "item"
            2) "book"
            3) "qty"
            4) "2"
127.0.0.1:6379> XACK orders workers 1723700000000-0
(integer) 1
```

This gives **at-least-once** delivery: an entry stays pending until acknowledged, so if a consumer
crashes before `XACK`, the work isn't lost — it can be reclaimed.

### Recovering failed work

Inspect what's pending with `XPENDING orders workers`. If a consumer died holding entries, another
consumer can take them over with `XCLAIM` (claim specific IDs that have been idle long enough) or
`XAUTOCLAIM` (scan and claim idle pending entries automatically). That's how a worker pool
self-heals after a crash.

### Keeping streams bounded

Streams persist, so they grow. Cap them at write time with `XADD orders MAXLEN ~ 10000 * ...` (the
`~` means *approximate* trimming, which is cheaper), or trim later with `XTRIM`. Without a cap, a
busy stream will consume memory indefinitely.

# Key Terminology

- **Stream** — an append-only, persistent log of entries, each with an ID and field-value pairs.
- **Entry ID** — `<ms-timestamp>-<sequence>`; always increasing; `*` auto-generates it.
- **Consumer group** — a set of consumers that split a stream's entries, one entry per consumer,
  with tracking.
- **PEL (Pending Entries List)** — entries delivered to a group but not yet acknowledged.
- **`XACK`** — acknowledge an entry so it leaves the PEL.
- **At-least-once** — an entry is delivered until acknowledged; a failure may cause redelivery.

# Options and Trade-offs

Redis's three "move data between producers and consumers" tools:

| Feature | Pub/Sub | List (queue) | Stream |
| ------- | ------- | ------------ | ------ |
| **Persisted / replay** | No | Element removed on pop | Yes — entries stay, replay by ID |
| **Multiple cooperating consumers** | All get every message | One consumer per element | Consumer groups split work |
| **Acknowledgements / recovery** | No | No (unless you build it) | Yes (PEL, `XACK`, `XCLAIM`) |
| **Ordering & history** | None | FIFO, no history | Ordered log with history |
| **Best for** | Real-time fan-out, loss OK | Simple work queue | Durable event log / reliable work queue |

# Worked Example

A reliable order-processing queue with two workers and crash recovery:

```text
# Producer appends orders
127.0.0.1:6379> XADD orders * item "book"
"1723700000000-0"
127.0.0.1:6379> XADD orders * item "pen"
"1723700000050-0"

# A group of workers is created; two workers pull work
127.0.0.1:6379> XGROUP CREATE orders workers 0
OK
127.0.0.1:6379> XREADGROUP GROUP workers alice COUNT 1 STREAMS orders >
1) 1) "orders"
   2) 1) 1) "1723700000000-0"
         2) 1) "item"
            2) "book"
127.0.0.1:6379> XREADGROUP GROUP workers bob COUNT 1 STREAMS orders >
1) 1) "orders"
   2) 1) 1) "1723700000050-0"
         2) 1) "item"
            2) "pen"

# alice finishes and acknowledges; bob crashes before acking
127.0.0.1:6379> XACK orders workers 1723700000000-0
(integer) 1
127.0.0.1:6379> XPENDING orders workers
1) (integer) 1
2) "1723700000050-0"
3) "1723700000050-0"
4) 1) 1) "bob"
      2) "1"
```

Alice's entry is acknowledged and gone from the pending list; Bob's entry is still pending (owned
by `bob`). Another worker can now `XAUTOCLAIM` or `XCLAIM` that idle entry and finish the job —
nothing is lost.

# Real World Analogy

A Stream is a **shared ticket spike at a busy kitchen**. Every order (entry) is skewered on the
spike in order and stays there (persistence). A **consumer group** is the line cooks: each ticket
is worked by exactly one cook, and a cook only pulls it off the spike (`XACK`) once the dish is
done. If a cook walks out mid-order, the ticket is still on the spike for someone else to grab
(`XCLAIM`) — no order silently vanishes.

# Examples

## Example 1 — Basic: an event log you can replay

Append user actions with `XADD events * type "login" user "42"`. Later, `XRANGE events - +`
replays the whole history in order — useful for debugging, auditing, or rebuilding state.

**Why this works:** entries persist and are ordered by ID, so the stream *is* the durable log.

## Example 2 — Real-world: scaling workers with a consumer group

Ten workers share `XREADGROUP GROUP pipeline <name> ... STREAMS jobs >`. Each job goes to one
worker; each `XACK`s on success. Add more workers and throughput rises; a crashed worker's
in-flight jobs are reclaimed via `XAUTOCLAIM`.

**Why this works:** consumer groups distribute entries and track completion, giving a reliable,
horizontally scalable queue.

## Example 3 — Trade-off / pitfall: never acknowledging (or never trimming)

A worker reads with `XREADGROUP` but forgets to `XACK`. Entries pile up in the PEL forever, and the
stream itself grows unbounded because nobody trims it — memory climbs until Redis is under
pressure.

**Why this bites:** at-least-once delivery *depends on* acknowledgement to release entries, and
persistence *requires* you to cap the log (`MAXLEN`/`XTRIM`). Forgetting either leaks memory.

# Common Mistakes

- **Forgetting to `XACK`.** Unacknowledged entries stay pending forever and the PEL grows.
- **Never capping the stream.** Use `MAXLEN ~ N` on `XADD` (or `XTRIM`) or it grows without bound.
- **Confusing `>` and `$`.** In `XREADGROUP`, `>` means "new, never-delivered to this group";
  reading a specific ID (or `0`) re-reads this consumer's pending entries. `$` is for plain
  `XREAD` ("only entries after now").
- **Reaching for Streams when Pub/Sub or a List is enough.** Streams add real concepts; use the
  simplest tool that meets the durability need.

# Best Practices

- Use consumer groups + `XACK` for **reliable, scalable** work distribution; use plain `XADD`/
  `XRANGE` when you just need a replayable log.
- Always **cap** streams with `MAXLEN ~` (approximate trimming is cheaper) sized to your retention
  needs.
- Monitor the **PEL** (`XPENDING`) and reclaim stuck entries with `XAUTOCLAIM` so a crashed
  consumer doesn't strand work.
- Let Redis assign IDs with `*` unless you have a specific reason to set them.

# Summary

- A **Stream** is a **persistent, append-only log**: `XADD` appends (IDs are `<ms>-<seq>`, `*`
  auto-generates), `XRANGE`/`XREAD` read and replay, `XLEN` counts.
- **Consumer groups** split entries among consumers, one entry each; `XREADGROUP ... >` fetches new
  work, `XACK` acknowledges, and unacked entries wait in the **PEL** — giving **at-least-once**
  delivery.
- `XPENDING` + `XCLAIM`/`XAUTOCLAIM` recover work from crashed consumers.
- Cap growth with `MAXLEN ~`/`XTRIM`.
- Choose Streams for **durable logs and reliable queues**; Pub/Sub for lossy real-time fan-out; a
  List for a simple queue.

# Flash Cards

Q: How is a Stream fundamentally different from Pub/Sub?
A: A Stream persists its entries (an append-only log) so they can be replayed by ID; Pub/Sub stores nothing and is fire-and-forget.

Q: What does a stream entry ID look like, and what does XADD's `*` do?
A: An ID is <millisecond-timestamp>-<sequence>, always increasing; `*` tells XADD to auto-generate the next ID.

Q: In a consumer group, what does the `>` ID mean in XREADGROUP?
A: Deliver entries never yet delivered to any consumer in this group (new work).

Q: What is the PEL, and how does an entry leave it?
A: The Pending Entries List holds entries delivered to a group but not yet acknowledged; XACK removes an entry from it.

Q: How do you recover entries owned by a crashed consumer?
A: Inspect with XPENDING, then reassign idle entries to another consumer with XCLAIM or XAUTOCLAIM.

Q: How do you stop a stream from growing without bound?
A: Cap it with MAXLEN (e.g. XADD ... MAXLEN ~ 10000) or trim it later with XTRIM.

# Exercises

### Easy
`XADD log * msg "started"` and `XADD log * msg "stopped"`, then `XLEN log` and `XRANGE log - +`.
Identify the two entry IDs and note that the second is larger.

### Medium
Create a consumer group with `XGROUP CREATE log g1 0`, read one entry with `XREADGROUP GROUP g1 c1
COUNT 1 STREAMS log >`, then `XPENDING log g1`. Acknowledge it with `XACK` and run `XPENDING`
again. Explain what changed.

### Challenging
Simulate a crash: with two consumers `c1` and `c2`, have `c1` read an entry but never `XACK` it.
Use `XPENDING` to see it stuck, then reclaim it for `c2` with `XAUTOCLAIM`. Describe how this gives
at-least-once delivery, and what would happen to memory if you never trimmed the stream.

# Further Reading

- Redis — *Redis Streams*: <https://redis.io/docs/latest/develop/data-types/streams/>
- Redis — *XADD* / *XREAD* / *XRANGE*: <https://redis.io/commands/xadd/>
- Redis — *XREADGROUP* / *XACK* / *XGROUP*: <https://redis.io/commands/xreadgroup/>
- Redis — *XAUTOCLAIM* / *XPENDING*: <https://redis.io/commands/xautoclaim/>
