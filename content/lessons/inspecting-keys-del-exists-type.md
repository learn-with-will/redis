---
slug: inspecting-keys-del-exists-type
title: "Core Key Commands: DEL, EXISTS, and TYPE"
topic: keys-and-strings
kind: api
summary: Inspect, verify, and delete keys using the fundamental key management commands DEL, EXISTS, and TYPE.
tags:
  - keys
  - del
  - exists
  - type
  - api
related:
  - keyspace-and-key-naming
  - keys-vs-scan
  - string-type-and-binary-safety
---
> **In one line:** Query key existence with `EXISTS`, identify internal data structures with `TYPE`, and remove entries with `DEL`.

## The idea

Regardless of the underlying data structure stored at a given key—whether it is an integer counter, a nested hash, or a sorted set—Redis provides a family of generic key-management commands that operate uniformly across the entire keyspace.

The three most fundamental commands are `EXISTS`, `TYPE`, and `DEL`. They allow client applications to verify state, branch logic based on underlying types, and clean up memory resources.

| Command | Time Complexity | Return Value | Behavior |
|---|---|---|---|
| `EXISTS key [key ...]` | $O(N)$ for $N$ keys | Integer count | Returns the number of queried keys that currently exist |
| `TYPE key` | $O(1)$ | Simple string | Returns the data type (`string`, `list`, `set`, `zset`, `hash`, `stream`, or `none`) |
| `DEL key [key ...]` | $O(N)$ where $N$ is keys/items | Integer count | Deletes specified keys and frees associated memory |
| `UNLINK key [key ...]` | $O(1)$ for keys | Integer count | Asynchronously deletes keys in a background thread |

> **Tip:** When deleting massive collections (such as sets or hashes with millions of elements), prefer `UNLINK` over `DEL` to avoid blocking the main execution thread.

## See it

Inspecting and deleting keys across varying data types:

```bash
# Create a string and a hash
SET config:cache_enabled "true"
HSET user:42 name "Elena" email "elena@example.com"

# Check existence of multiple keys
EXISTS config:cache_enabled user:42 user:99
# Returns: (integer) 2

# Inspect data types
TYPE config:cache_enabled
# Returns: string

TYPE user:42
# Returns: hash

# Delete the configuration key
DEL config:cache_enabled
# Returns: (integer) 1

# Check existence again
EXISTS config:cache_enabled
# Returns: (integer) 0
```

`DEL` returns the exact number of keys that were actually deleted, ignoring keys that did not exist.

## Go deeper

`DEL` operates synchronously: it removes the key from the keyspace dictionary and immediately deallocates every internal memory node before serving the next command. If a key holds an enormous collection (e.g., 500,000 members), `DEL` can block the server for tens of milliseconds.

`UNLINK` (introduced in Redis 4.0) resolves this by simply unlinking the key from the keyspace dictionary in $O(1)$ time and delegating the actual memory freeing to a background thread.

## Watch out

- Using `DEL` on very large collections blocks the single-threaded event loop; use `UNLINK` for large objects.
- `TYPE` returns `none` if the key does not exist or has already expired.

## Remember

- `EXISTS` counts how many queried keys currently exist in the database.
- `TYPE` returns the fundamental structure identifier or `none`.
- Use `UNLINK` instead of `DEL` for non-blocking deletion of large data objects.
