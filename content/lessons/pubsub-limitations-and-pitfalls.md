---
slug: pubsub-limitations-and-pitfalls
title: "Pub/Sub Trade-offs: Message Loss and Memory Buffers"
topic: messaging-and-streams
kind: pitfall
summary: "Understand Pub/Sub failure modes: message loss during network disconnects and client-output-buffer-limit drops."
tags:
  - pubsub
  - pitfalls
  - buffers
  - message-loss
related:
  - pubsub-architecture-and-channels
  - stream-data-type-and-append-log
  - consumer-groups-and-distributed-workers
---
> **In one line:** Pub/Sub cannot replay lost messages after disconnects and forcibly severs slow clients whose buffers overflow.

## The idea

Redis Pub/Sub is fast and lightweight precisely because it sacrifices delivery guarantees. When engineering real-time messaging, developers who misunderstand these architectural trade-offs experience silent message loss in production.

Two primary operational failure modes characterize Pub/Sub:
1. **Network Disconnect Message Loss:** If a subscriber client connection drops for even a fraction of a second during a network partition or deploy, all messages published during the disconnect are permanently lost.
2. **Buffer Overflow Termination:** Redis places outgoing messages into an in-memory client output buffer. If a subscriber cannot consume messages as fast as the publisher produces them, the buffer grows until Redis kills the connection.

| Operational Scenario | Pub/Sub Behavior | Streams Alternative |
|---|---|---|
| **Subscriber Disconnects** | Messages dropped permanently | Messages saved in log; replayed on reconnect |
| **Consumer Is Slow** | Client buffer overflows; connection severed | Backlog sits safely in stream; consumer catches up |
| **System Crash** | In-flight messages lost | Messages persisted via RDB / AOF |
| **Worker Scaling** | Every subscriber gets full duplicate copy | Consumer groups distribute load across workers |

> **Watch out:** Never use Redis Pub/Sub if your business logic requires delivery acknowledgements, message persistence, or offline replay.

## See it

Configuring and observing client output buffer limits in `redis.conf`:

```text
# Syntax: client-output-buffer-limit <class> <hard-limit> <soft-limit> <soft-seconds>
client-output-buffer-limit pubsub 32mb 8mb 60
```

This directive instructs Redis:
- If a Pub/Sub client's buffer reaches **32 megabytes** (hard limit), **immediately disconnect the client**.
- If a client's buffer exceeds **8 megabytes** continuously for **60 seconds** (soft limit), **disconnect the client**.

In `redis-cli`, monitor for disconnected clients by inspecting `INFO stats` and subscriber buffer sizes:

```bash
# Check client buffer metrics and connection drops
INFO stats

# Inspect active client connections and their output buffer memory
CLIENT LIST
# Look for: obl (output buffer length), oll (output list length), omem (output memory)

# Dynamically adjust buffer limits at runtime without restarting
CONFIG SET client-output-buffer-limit "pubsub 64mb 16mb 60"
# Returns: OK
```

When a buffer overflow occurs, the subscriber's TCP socket is closed and the client receives a connection reset error.

## Go deeper

In **Redis Cluster**, classic Pub/Sub broadcasts every `PUBLISH` command to every single node in the cluster so all nodes can notify local subscribers. This creates a broadcast storm at high cluster sizes.

To solve this, Redis 7.0 introduced **Sharded Pub/Sub** (`SPUBLISH` and `SSUBSCRIBE`). Sharded channels are bound to specific hash slots, routing messages only to the node owning the corresponding slot.

## Watch out

- Using Pub/Sub for background job queues will cause jobs to vanish permanently whenever workers restart.
- Disconnections caused by `client-output-buffer-limit` appear as mysterious network dropped connections in application logs.

## Remember

- Pub/Sub has zero message retention; disconnections result in permanent message loss.
- Exceeding client output buffer limits causes Redis to terminate slow subscriber connections.
- For durable, acknowledged, replayable messaging, use Redis Streams instead.
