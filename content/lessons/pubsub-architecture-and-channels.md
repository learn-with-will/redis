---
slug: pubsub-architecture-and-channels
title: Redis Pub/Sub Architecture and the Fire-and-Forget Model
topic: messaging-and-streams
kind: concept
summary: Redis Pub/Sub provides lightweight fire-and-forget message distribution across decoupled subscribers.
tags:
  - pubsub
  - messaging
  - architecture
  - fire-and-forget
related:
  - pubsub-commands-publish-subscribe
  - pattern-subscriptions-psubscribe
  - pubsub-limitations-and-pitfalls
---
> **In one line:** Redis Pub/Sub distributes real-time broadcast messages to active subscribers using a lightweight fire-and-forget model.

## The idea

In distributed architectures, microservices must frequently communicate asynchronous notifications—such as alerting WebSocket servers of a chat message, invalidating caches across web nodes, or broadcasting price updates.

Redis **Publish/Subscribe (Pub/Sub)** decouples message senders (**publishers**) from message recipients (**subscribers**). Publishers send messages to named **channels** without knowing who is listening, and subscribers express interest in channels without knowing who published the event.

| Architectural Dimension | Redis Pub/Sub | Redis Streams | Redis List Queue |
|---|---|---|---|
| **Delivery Guarantee** | **At-most-once (Fire-and-forget)** | At-least-once with acknowledgements | Exact-once consumption per pop |
| **Message Persistence** | **None** (unpersisted in memory) | Durable append-only log on disk | Persisted until popped |
| **Offline Clients** | Miss all messages sent while offline | Can replay past messages by ID | Jobs wait in queue |
| **Fan-out Capability** | 1-to-many (all subscribers receive copy) | 1-to-many via consumer groups | 1-to-1 (single worker consumes item) |

> **Important:** Pub/Sub is strictly fire-and-forget. Messages are never written to disk or buffered for offline clients; if a subscriber disconnects for 50 milliseconds, messages sent during that gap are permanently lost.

## See it

Broadcasting messages across decoupled terminal connections:

```bash
# Terminal 1: Subscriber listens to the "news:tech" channel
SUBSCRIBE news:tech
# Output confirms active subscription:
# 1) "subscribe"
# 2) "news:tech"
# 3) (integer) 1

# Terminal 2: Publisher broadcasts an update
PUBLISH news:tech "Redis 8 released with unified query engine!"
# Returns: (integer) 1 (Number of clients that received the broadcast)

# Terminal 1 receives the message in real time:
# 1) "message"
# 2) "news:tech"
# 3) "Redis 8 released with unified query engine!"
```

Notice that the return value of `PUBLISH` indicates the exact number of active client connections that received the message.

## Go deeper

Channels do not exist as keys in the Redis keyspace dictionary. They do not consume memory when idle, they do not appear in `SCAN`, and they cannot have time-to-live expirations attached.

Internally, Redis maintains a separate hash table mapping channel strings to linked lists of connected client socket descriptors. When a publisher issues `PUBLISH`, Redis iterates through the matching client sockets and writes the payload to their output buffers in $O(N)$ time where $N$ is the subscriber count.

## Watch out

- Never rely on Pub/Sub for financial transactions, payment events, or audit logs where message loss cannot be tolerated.
- Slow subscribers whose output buffers fill up will be forcibly disconnected by the server's `client-output-buffer-limit` setting.

## Remember

- Pub/Sub implements a lightweight 1-to-many broadcast fan-out model.
- Delivery is at-most-once (fire-and-forget); offline clients cannot recover missed messages.
- Channels do not occupy keyspace memory and are not persisted to disk.
