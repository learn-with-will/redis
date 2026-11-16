---
slug: consumer-groups-and-distributed-workers
title: "Consumer Groups: Distributed Work Queues with XGROUP and XREADGROUP"
topic: messaging-and-streams
kind: pattern
summary: Distribute stream processing across competing workers with Consumer Groups using XGROUP and XREADGROUP.
tags:
  - consumer-groups
  - xgroup
  - xreadgroup
  - workers
  - patterns
related:
  - stream-data-type-and-append-log
  - stream-acknowledgements-and-recovery
  - blocking-list-pops
---
> **In one line:** Consumer Groups distribute stream events across a pool of competing workers with automatic state tracking and load balancing.

## The idea

When a single worker cannot keep pace with high incoming event throughput, you need to scale horizontally by running multiple worker processes. If all workers use plain `XREAD`, every worker receives a duplicate copy of every message.

Redis **Consumer Groups** (inspired by Kafka) solve this. A Consumer Group acts as a virtual coordinator over a stream:
1. Multiple workers (**consumers**) join the same group.
2. Redis distributes incoming messages across consumers so each message is processed by **exactly one consumer in the group**.
3. Redis tracks which messages are pending acknowledgment via a **Pending Entries List (PEL)**.

| Consumer Group Concept | Role / Meaning |
|---|---|
| **Stream Key** | The underlying event log (e.g., `orders:stream`) |
| **Group Name** | The logical processing cluster (e.g., `order-processors`) |
| **Consumer Name** | The unique identifier of a specific worker instance (e.g., `worker-pod-4`) |
| **Pending Entries List (PEL)** | Messages delivered to a worker but not yet acknowledged via `XACK` |

> **Note:** Multiple independent consumer groups can read the same stream, allowing the `email-notifier` group and `fraud-detector` group to each process a full copy of the events independently.

## See it

Setting up a consumer group and distributing work across competing workers:

```bash
# 1. Create a consumer group on "orders:stream" starting from the beginning (ID "0")
# "MKSTREAM" creates the stream if it does not already exist
XGROUP CREATE orders:stream order-workers 0 MKSTREAM
# Returns: OK

# 2. Add sample orders
XADD orders:stream * item "laptop" price 1200
XADD orders:stream * item "monitor" price 300
XADD orders:stream * item "keyboard" price 90

# 3. Worker 1 consumes the next unread message (denoted by special ID ">")
XREADGROUP GROUP order-workers worker_1 COUNT 1 STREAMS orders:stream >
# Delivers: Item "laptop" to worker_1

# 4. Worker 2 consumes the next unread message
XREADGROUP GROUP order-workers worker_2 COUNT 1 STREAMS orders:stream >
# Delivers: Item "monitor" to worker_2
```

Notice that Worker 1 and Worker 2 received distinct, non-overlapping messages. The special ID `>` instructs Redis to deliver messages that have never been delivered to any consumer in the group.

## Go deeper

If a worker crashes halfway through processing a task, the message remains safely tracked inside that consumer's **Pending Entries List (PEL)**.

When the worker restarts, it can query its own unfinished backlog by passing ID `0` instead of `>` to `XREADGROUP`:
```bash
# Re-deliver all pending, unacknowledged messages assigned to worker_1
XREADGROUP GROUP order-workers worker_1 COUNT 10 STREAMS orders:stream 0
```

## Watch out

- Forgetting to acknowledge processed messages with `XACK` causes the PEL to grow indefinitely, consuming server memory.
- Using `>` delivers only previously undelivered messages; using `0` delivers historical pending messages.

## Remember

- Consumer Groups partition stream event delivery across competing worker instances.
- The special ID `>` requests brand-new, never-before-delivered events.
- Undelivered or unacknowledged messages are safely tracked in the Pending Entries List (PEL).
