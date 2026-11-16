---
slug: stream-data-type-and-append-log
title: "Redis Streams: The Append-Only Event Log"
topic: messaging-and-streams
kind: concept
summary: Redis Streams provide durable, append-only event logs with unique IDs, consumer groups, and persistence.
tags:
  - streams
  - event-log
  - messaging
  - durability
related:
  - appending-and-reading-streams
  - consumer-groups-and-distributed-workers
  - pubsub-architecture-and-channels
---
> **In one line:** A Redis Stream is a persistent, append-only log of field-value entries queryable by timestamp ID and consumable by worker groups.

## The idea

Introduced in Redis 5.0, the **Stream** data type modeled after Apache Kafka provides a powerful, durable event log directly inside Redis.

Unlike Pub/Sub channels (which discard messages immediately), a Stream stores every entry permanently in memory and on disk via RDB and AOF persistence. Senders append events to the log, and multiple consumers can read, paginate, and process entries at their own pace—either in real time or retroactively from historical timestamps.

| Architecture Trait | Pub/Sub | Stream | List Queue |
|---|---|---|---|
| **Persistence** | None (ephemeral) | **Durable append-only log** | Durable until popped |
| **Consumer Identity** | Anonymous TCP sockets | Named Consumer Groups with state | Anonymous workers |
| **Delivery Model** | At-most-once | **At-least-once with ACK** | Exactly-once pop |
| **History Replay** | Impossible | **Full historical replay by ID** | Impossible once popped |

> **Note:** Stream entry IDs are formatted as `<millisecondsTime>-<sequenceNumber>` (e.g., `1700000000000-0`), providing automatic millisecond temporal ordering.

## See it

Appending and inspecting events in a Redis Stream:

```bash
# Append an order event to the "orders:stream"
# '*' instructs Redis to auto-generate the timestamp ID
XADD orders:stream * user_id "1001" item "keyboard" price "120.00"
# Returns: "1763321400123-0" (Generated Stream Entry ID)

# Append a second event
XADD orders:stream * user_id "1002" item "mouse" price "45.00"
# Returns: "1763321405456-0"

# Check stream length in O(1)
XLEN orders:stream
# Returns: (integer) 2

# Inspect all stored events in the stream
XRANGE orders:stream - +
# Returns:
# 1) 1) "1763321400123-0"
#    2) 1) "user_id" 2) "1001" 3) "item" 4) "keyboard" 5) "price" 6) "120.00"
# 2) 1) "1763321405456-0"
#    2) 1) "user_id" 2) "1002" 3) "item" 4) "mouse" 5) "price" 6) "45.00"
```

Entries remain stored in the stream even after they have been read, allowing other consumers to replay the exact sequence of events.

## Go deeper

Each Stream entry consists of a unique 128-bit ID and a list of field-value string pairs. Internally, Redis encodes stream entries using a **radix tree** of compact `listpacks`, allowing millions of events to be stored with minimal memory pointer overhead.

The `-` and `+` symbols in `XRANGE` represent the minimum possible ID (`0-0`) and maximum possible ID respectively.

## Watch out

- Unbounded streams consume RAM indefinitely; use `XTRIM` or `MAXLEN` in `XADD` to bound stream size.
- Stream IDs must be strictly monotonically increasing; submitting a manual ID equal to or lower than the latest entry causes an error.

## Remember

- Redis Streams are durable, ordered, append-only logs of field-value entries.
- Stream entry IDs are timestamp-based and strictly monotonically increasing.
- Events persist in memory and disk, enabling full historical replay across multiple consumers.
