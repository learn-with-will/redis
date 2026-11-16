---
slug: set-options-nx-xx-get
title: "Advanced SET Modifiers: EX, PX, NX, and XX"
topic: keys-and-strings
kind: api
summary: Master conditional writes and atomic expirations using modern SET modifiers EX, PX, NX, and XX.
tags:
  - set
  - modifiers
  - nx
  - xx
  - ttl
related:
  - string-type-and-binary-safety
  - atomic-counters-incr-decr
  - expire-and-ttl-basics
---
> **In one line:** The modern `SET` command combines conditional assignment (`NX`/`XX`) and key expiration (`EX`/`PX`) into a single atomic call.

## The idea

In early versions of Redis, setting a key with an expiration required two separate commands: `SET key val` followed by `EXPIRE key 60`. If the network disconnected or the client crashed between those two commands, the key remained in Redis forever without an expiration.

Similarly, setting a key only if it did not exist required the legacy command `SETNX`. Modern Redis unifies these patterns into the standard `SET` command with optional modifier flags, guaranteeing atomic evaluation.

| Modifier | Argument | Behavior | Common Use Case |
|---|---|---|---|
| `EX seconds` | Seconds integer | Sets time-to-live expiration in seconds | Short-lived cache records |
| `PX milliseconds` | Milliseconds integer | Sets time-to-live expiration in milliseconds | Fine-grained rate limits |
| `NX` | None | Only set the key if it does **not** already exist | Distributed mutex locking |
| `XX` | None | Only set the key if it **already** exists | Updating existing entity state |
| `GET` | None | Returns old value while atomically setting new value | Atomic swap-and-read operations |

> **Note:** `NX` and `XX` are mutually exclusive; a single `SET` command cannot specify both conditions.

## See it

Using conditional modifiers and expiration flags:

```bash
# Set a cache entry that expires in 60 seconds
SET session:user_99 "active" EX 60
# Returns: OK

# Attempt to acquire a distributed lock (only succeeds if key does not exist)
SET lock:order_processing "worker_1" EX 30 NX
# Returns: OK (lock acquired!)

# A second worker attempts to acquire the same lock:
SET lock:order_processing "worker_2" EX 30 NX
# Returns: (nil) -> Lock acquisition failed!

# Update an existing key only if it exists
SET session:user_99 "idle" XX
# Returns: OK
```

When an `NX` condition fails because the key already exists, Redis returns `(nil)` instead of overwriting the stored data.

## Go deeper

The combination `SET key token EX 30 NX` is the universally recommended foundational building block for distributed locking. Because the creation of the key and the attachment of its time-to-live expiration occur in a single atomic instruction, there is zero risk of an unexpired zombie lock persisting if the acquiring worker crashes immediately after invocation.

The `GET` modifier (introduced in Redis 6.2) turns `SET` into an atomic "get-and-set" primitive, returning the previous value while storing the new one.

## Watch out

- Using deprecated `SETNX` without an expiration risks permanent deadlock if your application crashes.
- Do not mix `EX` and `PX` in the same command; specify duration in seconds or milliseconds, not both.

## Remember

- Modern `SET` replaces `SETNX` and `SETEX` with atomic modifiers.
- `NX` sets only if absent; `XX` sets only if present.
- `EX` (seconds) and `PX` (milliseconds) bind expiration lifetime atomically upon key creation.
