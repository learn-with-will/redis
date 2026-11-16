---
slug: appending-and-reading-streams
title: Adding and Reading Events with XADD, XRANGE, and XREAD
topic: messaging-and-streams
kind: api
summary: "Master core Stream operations: append entries with XADD, query intervals with XRANGE, and block on updates with XREAD."
tags:
  - streams
  - xadd
  - xrange
  - xread
  - api
related:
  - stream-data-type-and-append-log
  - consumer-groups-and-distributed-workers
  - capped-streams-xtrim
---
> **In one line:** Append events with `XADD`, inspect historical ranges with `XRANGE`, and stream live events with `XREAD`.

## The idea

The Redis Stream API provides rich primitives for writing, querying, and streaming event logs. Unlike standard database tables, streams support both synchronous historical range lookups and blocking real-time event streaming.

The three core entry-level commands are `XADD` (insert), `XRANGE` (range query), and `XREAD` (stream listener).

| Command | Arguments | Time Complexity | Return Value / Behavior |
|---|---|---|---|
| `XADD key [MAXLEN] ID f v ...` | Key, ID (or `*`), pairs | $O(1)$ amortized | Returns generated entry ID |
| `XRANGE key start end [COUNT n]` | Key, ID bounds, limit | $O(N)$ for $N$ entries | Returns entries in ascending order |
| `XREVRANGE key end start [COUNT]` | Key, ID bounds, limit | $O(N)$ for $N$ entries | Returns entries in descending order |
| `XREAD [BLOCK ms] STREAMS key ID` | Streams and offset IDs | $O(N)$ for $N$ entries | Reads entries newer than specified ID |

> **Tip:** In `XREAD`, passing `$` as the ID offset instructs Redis to listen only for **new** messages arriving *after* the command starts blocking.

## See it

Writing events and reading live stream feeds:

```bash
# Add events with explicit key-value fields
XADD telemetry:server1 * cpu "88.2" ram "74.1"
XADD telemetry:server1 * cpu "89.5" ram "75.0"
XADD telemetry:server1 * cpu "92.0" ram "78.4"

# Query the latest single event in descending order
XREVRANGE telemetry:server1 + - COUNT 1
# Returns only the single newest reading

# Live Streaming: Block for up to 5000ms waiting for events newer than ID "0"
XREAD COUNT 2 STREAMS telemetry:server1 0
# Returns the first 2 entries in the stream

# Inspect stream length in constant time
XLEN telemetry:server1
# Returns: (integer) 3

# Query events within an exact timestamp window
XRANGE telemetry:server1 - + COUNT 2

# Listen strictly for future events (BLOCK 0 waits indefinitely):
XREAD BLOCK 0 STREAMS telemetry:server1 $
```

When new events arrive on `telemetry:server1`, the blocking `XREAD` unblocks immediately and delivers the payload to the listening worker.

## Go deeper

`XREAD` can monitor **multiple streams simultaneously**:
```bash
XREAD BLOCK 2000 STREAMS stream_a stream_b $ $
```

If an event arrives on either `stream_a` or `stream_b`, Redis wakes the client and delivers the corresponding payload. This allows single-threaded microservices to multiplex event listening across multiple event queues cleanly without spawning multiple worker processes or connection threads.

Furthermore, reading stream items does not delete them from memory; messages remain permanently accessible to other consumers and historical query tools until explicitly trimmed.

## Watch out

- Using `XREAD` without consumer groups means multiple worker connections will all process duplicate copies of the same stream events.
- Reading very large counts without pagination limit bounds can saturate network socket buffers.

## Remember

- `XADD` appends field-value events and auto-generates timestamp IDs with `*`.
- `XRANGE` and `XREVRANGE` inspect historical slices with forward and reverse ordering.
- `XREAD BLOCK` listens for live incoming stream events without polling spinlocks.
