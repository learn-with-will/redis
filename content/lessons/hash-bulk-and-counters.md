---
slug: hash-bulk-and-counters
title: Bulk Field Operations and Numeric Counters in Hashes
topic: lists-and-hashes
kind: technique
summary: Read multiple fields with HMGET, retrieve full objects with HGETALL, and perform atomic arithmetic with HINCRBY.
tags:
  - hashes
  - hmget
  - hgetall
  - hincrby
  - counters
related:
  - hash-crud-hset-hget-hdel
  - hash-structure-and-field-values
  - atomic-counters-incr-decr
---
> **In one line:** Query multiple fields with `HMGET`, retrieve full dictionaries with `HGETALL`, and increment metrics with `HINCRBY`.

## The idea

Applications frequently need to fetch multiple attributes of an object at once—such as rendering a user's name, avatar, and role on a dashboard—or atomically increment numeric counters stored as hash fields.

Redis provides bulk retrieval and atomic mathematical commands tailored for hashes, eliminating multiple network round-trips.

| Command | Arguments | Time Complexity | Return Value |
|---|---|---|---|
| `HMGET key field [field ...]` | Key and fields | $O(N)$ for $N$ fields | Array of field values in matching request order |
| `HGETALL key` | Key | $O(N)$ for entire hash | Flat array alternating between field names and values |
| `HINCRBY key field increment` | Key, field, int | $O(1)$ | New integer value after atomic addition |
| `HINCRBYFLOAT key field float` | Key, field, float | $O(1)$ | New string value after floating-point addition |

> **Watch out:** While `HGETALL` is convenient, calling it on hashes containing thousands of fields can block the single-threaded server and saturate network buffers.

## See it

Querying fields and incrementing analytics counters inside a user profile:

```bash
# Seed user profile data
HSET user:501 name "David" department "Engineering" login_count 10 balance "100.50"

# Fetch multiple specific fields in one call
HMGET user:501 name department non_existent_field
# Returns:
# 1) "David"
# 2) "Engineering"
# 3) (nil)

# Atomically increment the login counter
HINCRBY user:501 login_count 1
# Returns: (integer) 11

# Atomically credit the account balance
HINCRBYFLOAT user:501 balance 25.75
# Returns: "126.25"

# Retrieve all fields and values
HGETALL user:501
```

`HINCRBY` operates directly on numeric strings stored inside hash fields without requiring client-side transactions or locks.

## Go deeper

When querying large hashes, `HSCAN` provides non-blocking cursor iteration similar to `SCAN`:

```bash
# Iterate through fields in batches of 10 without blocking the server
HSCAN user:501 0 COUNT 10
```

`HVALS` and `HKEYS` return only values or field names respectively, each with $O(N)$ complexity. For general application reads, `HMGET` remains the safest and fastest command because it requests only the exact fields needed.

## Watch out

- Using `HGETALL` on arbitrarily large hashes is a frequent cause of production latency spikes; prefer `HMGET` or `HSCAN`.
- `HINCRBY` fails with an error if the field contains a non-numeric string value.

## Remember

- `HMGET` fetches multiple fields in a single round-trip without serializing unused fields.
- `HINCRBY` and `HINCRBYFLOAT` execute atomic arithmetic directly inside hash fields.
- Use `HSCAN` instead of `HGETALL` when iterating across very large hashes.
