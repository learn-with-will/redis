---
slug: pattern-subscriptions-psubscribe
title: Pattern-Based Subscriptions with PSUBSCRIBE
topic: messaging-and-streams
kind: technique
summary: Subscribe to dynamic channel hierarchies and wildcards using pattern-matching commands PSUBSCRIBE and PUNSUBSCRIBE.
tags:
  - psubscribe
  - patterns
  - wildcards
  - pubsub
related:
  - pubsub-commands-publish-subscribe
  - pubsub-architecture-and-channels
  - pubsub-limitations-and-pitfalls
---
> **In one line:** Use `PSUBSCRIBE` to listen to multiple channels matching glob-style patterns like `sensor:europe:*`.

## The idea

In complex systems, listening to explicit channel names individually becomes unmanageable. Consider an IoT telemetry platform with thousands of sensors streaming data: a logging service might want to listen to all European sensors (`sensor:europe:*`), while an auditing service needs all critical alerts regardless of region (`alert:*:critical`).

Redis provides **pattern-based subscriptions** via `PSUBSCRIBE`. Instead of specifying exact channel names, subscribers provide glob-style wildcard expressions.

| Glob Character | Matching Rule | Example Pattern | Matching Channels |
|---|---|---|---|
| `*` | Matches any sequence of characters | `chat:room:*` | `chat:room:general`, `chat:room:vip` |
| `?` | Matches exactly one single character | `order:eu-?` | `order:eu-1`, `order:eu-2` |
| `[abc]` | Matches any single character within bracket | `audit:[dev\|prod]` | `audit:dev`, `audit:prod` |

> **Note:** A client can listen to both explicit channels (`SUBSCRIBE`) and wildcard patterns (`PSUBSCRIBE`) simultaneously on the same connection.

## See it

Listening to wildcard topic hierarchies with `PSUBSCRIBE`:

```bash
# Terminal 1: Subscribe to all weather stations in North America
PSUBSCRIBE weather:na:*
# Output confirms pattern registration:
# 1) "psubscribe"
# 2) "weather:na:*"
# 3) (integer) 1

# Terminal 2: Publishers send updates to distinct regional channels
PUBLISH weather:na:seattle "Rain, 12C"
# Returns: (integer) 1

PUBLISH weather:na:boston "Sunny, 18C"
# Returns: (integer) 1

PUBLISH weather:eu:paris "Cloudy, 15C"
# Returns: (integer) 0 (Does not match pattern!)

# Terminal 1 receives a 4-part RESP message array:
# 1) "pmessage"
# 2) "weather:na:*"              <-- Pattern that matched
# 3) "weather:na:seattle"         <-- Actual channel published to
# 4) "Rain, 12C"                  <-- Payload
```

Terminal 1 receives notifications for both Seattle and Boston, but Paris is ignored because it fails to match `weather:na:*`.

## Go deeper

Whenever a message is published, Redis checks two independent registration lists:
1. Exact channel subscribers: matched via $O(1)$ hash table lookup.
2. Pattern subscribers: matched by testing the channel against every registered pattern using linear glob comparison.

If a published channel matches both an exact channel subscription and a pattern subscription held by the *same client*, Redis delivers **two separate copies** of the message to that client.

## Watch out

- Registering hundreds of complex wildcard patterns degrades `PUBLISH` latency because Redis evaluates patterns sequentially for every message.
- Unsubscribing requires `PUNSUBSCRIBE`; calling `UNSUBSCRIBE` will not clear pattern subscriptions.

## Remember

- `PSUBSCRIBE` matches multiple channels dynamically using glob-style wildcards (`*`, `?`).
- Pattern notifications deliver a 4-part message array identifying both the pattern and the actual channel.
- Excessive pattern registrations can increase CPU overhead during `PUBLISH` evaluations.
