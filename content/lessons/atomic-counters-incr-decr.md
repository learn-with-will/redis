---
slug: atomic-counters-incr-decr
title: Atomic Numeric Counters with INCR and DECR
topic: keys-and-strings
kind: technique
summary: Implement thread-safe distributed counters and rate limiters using atomic INCR, DECR, and INCRBY commands.
tags:
  - counters
  - incr
  - decr
  - atomicity
related:
  - string-type-and-binary-safety
  - set-options-nx-xx-get
  - building-a-distributed-rate-limiter
---
> **In one line:** Redis provides atomic integer arithmetic on string keys via `INCR`, `DECR`, and `INCRBY` without client-side locking.

## The idea

One of the most powerful capabilities of Redis Strings is their ability to interpret string payloads as 64-bit signed integers or IEEE 754 floating-point values for mathematical operations.

In a traditional application talking to an SQL database, incrementing a counter involves reading the current value, incrementing it locally, and writing it back. Under concurrent traffic, multiple workers read the same number simultaneously, resulting in lost updates. Redis solves this by performing the entire increment atomically inside its single-threaded core.

| Command | Argument | Time Complexity | Return Value |
|---|---|---|---|
| `INCR key` | None (increments by 1) | $O(1)$ | The new integer value after incrementing |
| `DECR key` | None (decrements by 1) | $O(1)$ | The new integer value after decrementing |
| `INCRBY key increment` | Signed integer | $O(1)$ | The new integer value after addition |
| `INCRBYFLOAT key float` | Double precision float | $O(1)$ | The new string value after floating-point addition |

> **Tip:** If the target key does not exist, Redis initializes it to `0` before performing the arithmetic operation.

## See it

Implementing a distributed visitor counter and quota tracker:

```bash
# Initialize and increment page view counter
INCR metrics:page_views
# Returns: (integer) 1

# Increment by custom quantities
INCRBY metrics:page_views 5
# Returns: (integer) 6

# Decrement inventory stock
SET product:42:stock "100"
DECR product:42:stock
# Returns: (integer) 99

# Increment floating-point financial balance
SET account:101:balance "50.25"
INCRBYFLOAT account:101:balance 14.50
# Returns: "64.75"
```

Notice that `INCR` operates directly on string keys without requiring explicit schema conversion.

## Go deeper

Because Redis guarantees that `INCR` is atomic, it serves as the foundational primitive for:
- **Distributed Rate Limiting:** Incrementing a request counter for an IP address within a fixed time window.
- **Auto-Incrementing Sequence IDs:** Generating unique distributed primary keys across microservices.
- **Usage Quotas:** Decrementing remaining API credits until reaching zero.

Redis internally stores the number in a 64-bit signed integer representation, bounding values between $-2^{63}$ and $2^{63}-1$.

## Watch out

- Calling `INCR` on a key containing a non-numeric string returns an `-ERR value is not an integer` error.
- Floating-point addition with `INCRBYFLOAT` may introduce standard IEEE 754 binary floating-point rounding quirks.

## Remember

- `INCR` and `DECR` execute atomic arithmetic in $O(1)$ constant time.
- Missing keys are automatically initialized to 0 prior to incrementing.
- Atomic counters eliminate race conditions across distributed microservices without distributed locks.
