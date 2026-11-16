---
slug: stream-acknowledgements-and-recovery
title: "Message Acknowledgement and Failure Recovery: XACK, XPENDING, XCLAIM"
topic: messaging-and-streams
kind: technique
summary: Implement robust at-least-once message processing and worker failure recovery using XACK, XPENDING, and XAUTOCLAIM.
tags:
  - xack
  - xpending
  - xautoclaim
  - recovery
  - streams
related:
  - consumer-groups-and-distributed-workers
  - stream-data-type-and-append-log
  - capped-streams-xtrim
---
> **In one line:** Guarantee at-least-once processing by acknowledging tasks with `XACK` and recovering dead worker jobs with `XAUTOCLAIM`.

## The idea

In distributed queue architectures, workers can crash, lose network connectivity, or experience hardware panics halfway through processing a task. If the messaging system automatically dropped messages upon delivery, tasks would be lost forever.

Redis Streams achieve **at-least-once delivery** using an explicit acknowledgment protocol:
1. When a worker receives a message, Redis moves it to the consumer group's **Pending Entries List (PEL)**.
2. Once the worker finishes processing, it issues `XACK`. Redis deletes the entry from the PEL.
3. If a worker dies without acknowledging, surviving workers inspect the PEL with `XPENDING` and claim the abandoned tasks using `XAUTOCLAIM`.

| Command | Arguments | Time Complexity | Purpose |
|---|---|---|---|
| `XACK key group ID [ID ...]` | Stream, group, message IDs | $O(1)$ per ID | Acknowledges successful processing; removes from PEL |
| `XPENDING key group [start end count]` | Stream, group, bounds | $O(1)$ summary, $O(N)$ detail | Inspects unacknowledged messages in the PEL |
| `XAUTOCLAIM key group consumer min-idle start [COUNT]` | Group, worker, idle ms | $O(1)$ amortized | Reassigns abandoned tasks from dead workers |

> **Tip:** Modern applications should use `XAUTOCLAIM` (introduced in Redis 6.2) instead of legacy `XCLAIM`, as it combines scanning and claiming into a single atomic call.

## See it

Acknowledging completed tasks and recovering abandoned jobs:

```bash
# 1. Worker 1 reads an event (ID: 1763321400123-0)
XREADGROUP GROUP order-workers worker_1 COUNT 1 STREAMS orders:stream >

# 2. Worker 1 processes successfully and sends acknowledgment
XACK orders:stream order-workers 1763321400123-0
# Returns: (integer) 1 (Message successfully acknowledged and removed from PEL!)

# 3. Inspect pending unacknowledged tasks across the group
XPENDING orders:stream order-workers
# Returns:
# 1) (integer) 1              <-- Total pending unacknowledged tasks
# 2) "1763321405456-0"        <-- Smallest pending ID
# 3) "1763321405456-0"        <-- Greatest pending ID
# 4) 1) 1) "worker_2" 2) "1"  <-- Worker 2 has 1 pending message!

# 4. Worker 2 crashed! Worker 3 claims tasks idle for over 60,000ms (1 minute)
XAUTOCLAIM orders:stream order-workers worker_3 60000 0-0 COUNT 1
# Transfers ownership to worker_3 and returns the message payload for immediate processing!
```

Worker 3 claims the abandoned task and processes it, preventing lost orders despite Worker 2's fatal crash.

## Go deeper

`XPENDING` tracks critical debugging metadata for every unacknowledged message:
- The consumer holding the message.
- The idle time in milliseconds since the message was last delivered.
- The delivery count (how many times this message has been transferred).

If a message has been attempted 5 times and keeps crashing workers (a **Poison Pill** message), application logic can detect the high delivery count in `XPENDING`, write it to a Dead Letter Queue (DLQ), and issue `XACK` to purge it from the main pipeline.

## Watch out

- Failing to call `XACK` causes memory to leak as the Pending Entries List accumulates millions of historical records.
- Setting `min-idle-time` too low in `XAUTOCLAIM` can cause healthy slow workers to have their tasks stolen prematurely.

## Remember

- `XACK` confirms successful message processing and clears entries from the PEL.
- `XPENDING` surfaces abandoned tasks and tracks idle times and delivery attempts.
- `XAUTOCLAIM` reassigns stale tasks from crashed workers to healthy consumers automatically.
