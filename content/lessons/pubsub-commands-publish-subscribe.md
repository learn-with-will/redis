---
slug: pubsub-commands-publish-subscribe
title: "Publishing and Subscribing: PUBLISH and SUBSCRIBE"
topic: messaging-and-streams
kind: api
summary: Master core Pub/Sub operations to subscribe to channels, broadcast messages, and inspect active channels.
tags:
  - pubsub
  - publish
  - subscribe
  - channels
  - api
related:
  - pubsub-architecture-and-channels
  - pattern-subscriptions-psubscribe
  - pubsub-limitations-and-pitfalls
---
> **In one line:** Subscribe to broadcast channels using `SUBSCRIBE` and push messages to all listeners with `PUBLISH`.

## The idea

The Redis Pub/Sub API is designed for simplicity. When a client issues `SUBSCRIBE`, the connection enters **subscriber mode**: the connection can no longer issue regular data commands (like `SET` or `GET`) and instead listens exclusively for incoming channel notifications or subscription management commands.

Publishing requires no setup or prior channel registration. Any normal client connection can issue `PUBLISH` to any channel at any time.

| Command | Arguments | Valid In Subscriber Mode? | Return Value / Behavior |
|---|---|---|---|
| `SUBSCRIBE channel [...]` | One or more channels | Yes | Subscribes to channels; receives incoming messages |
| `UNSUBSCRIBE [channel ...]` | Optional channels | Yes | Unsubscribes from specified or all channels |
| `PUBLISH channel message` | Channel and string message | Normal mode only | Integer count of subscribers that received the message |
| `PUBSUB CHANNELS [pattern]` | Optional pattern | Normal mode only | Lists all currently active channels with >= 1 subscriber |
| `PUBSUB NUMSUB [channel ...]` | Channel names | Normal mode only | Returns subscriber count for specified channels |

> **Tip:** In application code, maintain a dedicated Redis connection pool strictly for subscribers, separating them from the general read/write connection pool.

## See it

Subscribing, publishing, and querying channel metadata in `redis-cli`:

```bash
# Terminal 1: Subscribe to two channels simultaneously
SUBSCRIBE orders:created orders:cancelled

# Terminal 2: Check active channels from an administrative client
PUBSUB CHANNELS
# Returns:
# 1) "orders:created"
# 2) "orders:cancelled"

# Check exact subscriber count
PUBSUB NUMSUB orders:created
# Returns:
# 1) "orders:created"
# 2) (integer) 1

# Publish an event to the orders channel
PUBLISH orders:created '{"order_id":4821,"amount":99.50}'
# Returns: (integer) 1

# Unsubscribe from cancelled orders
UNSUBSCRIBE orders:cancelled
```

Terminal 1 receives the JSON payload formatted as a three-part RESP array: `["message", "orders:created", payload]`.

## Go deeper

When a client connection enters subscriber mode, the only commands permitted on that connection are:
- `SUBSCRIBE`, `UNSUBSCRIBE`
- `PSUBSCRIBE`, `PUNSUBSCRIBE`
- `SSUBSCRIBE`, `SUNSUBSCRIBE` (Sharded Pub/Sub in Redis 7+)
- `PING`, `RESET`, `QUIT`

Sending any data-manipulation command (e.g., `GET` or `SET`) while in subscriber mode results in a protocol error reply.

## Watch out

- Attempting to reuse an active subscriber connection to run standard database queries will fail with an error.
- If zero subscribers are listening when a message is published, `PUBLISH` returns `0` and the payload is immediately discarded.

## Remember

- `SUBSCRIBE` locks the client connection into subscriber listening mode.
- `PUBLISH` broadcasts messages to all active channel listeners and returns the delivery count.
- Use `PUBSUB CHANNELS` and `PUBSUB NUMSUB` to monitor active messaging traffic.
