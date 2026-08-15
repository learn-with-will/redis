---
id: lesson-03
slug: keys-and-strings
title: "Keys and Strings"
level: beginner
order: 3
duration: 24
tags:
  - strings
  - keys
  - scan
  - counters
  - expiration
summary: "The Redis keyspace and key-naming conventions, the essential key commands, why KEYS is dangerous and SCAN is safe, and the String type in depth — SET options, atomic counters with INCR, and multi-key operations."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Name and manage keys with `SET`, `GET`, `DEL`, `EXISTS`, `TYPE`, and `RENAME`.
- Explain why **`KEYS` is dangerous** in production and use **`SCAN`** instead.
- Use the **String** type as text, numbers, and small binary blobs (up to 512 MB).
- Increment counters atomically with `INCR` / `INCRBY` / `INCRBYFLOAT`.
- Use `SET` options (`EX`, `NX`, `XX`, `GET`) and multi-key `MSET` / `MGET`.

# Why It Matters

Strings are the most fundamental Redis type, and keys are how you reach *everything*. Almost
every Redis pattern — caches, counters, feature flags, simple locks, session tokens — is built
on well-named keys holding string values. Get comfortable here and the rest of Redis is
variations on the theme.

# Concept Explanation

### The keyspace and naming keys

Every value in Redis lives under a **key**, which is a **binary-safe string** (usually you'll
use readable text). All keys together form the **keyspace**. Keys are **case-sensitive**:
`user:1` and `User:1` are different.

There's a strong community convention: build keys from **colon-separated segments** that go
from general to specific, e.g. `user:42:session`, `cart:42:items`, `page:home:views`. Redis
doesn't parse the colons — it's purely a readability convention — but it keeps a large keyspace
organized and makes patterns like `user:42:*` meaningful to humans.

Core key commands:

- `EXISTS key` — `1` if it exists, `0` if not.
- `DEL key [key ...]` — delete one or more keys; returns how many were removed.
- `TYPE key` — the value's type (`string`, `list`, `hash`, `set`, `zset`, `stream`).
- `RENAME key newkey` — rename a key.

### KEYS vs SCAN — this one matters

`KEYS pattern` returns **all** keys matching a glob pattern. It sounds convenient, but it is
**O(N)** over the whole keyspace and runs in that single command thread — so on a large
database it can **block the entire server** for a noticeable time. Treat `KEYS` as a
local/debugging tool only.

In production, iterate with **`SCAN`** instead. `SCAN` is a **cursor-based** iterator: you call
it repeatedly, passing back the cursor it returns, until the cursor comes back as `0`.

```text
127.0.0.1:6379> SCAN 0 MATCH user:* COUNT 100
1) "17"
2) 1) "user:1"
   2) "user:42"
127.0.0.1:6379> SCAN 17 MATCH user:* COUNT 100
1) "0"
2) 1) "user:99"
```

Each call does a small amount of work, so the server stays responsive. `SCAN`'s guarantees are
weaker than `KEYS`, and that's the deal you accept for safety: keys present for the whole
iteration are returned **at least once**, but you may see **duplicates**, and `COUNT` is only a
**hint** for how much work to do per call, not a limit on results.

### The String type

A Redis **String** is the simplest value: a sequence of bytes. It's **binary-safe** (it can
hold text, a number, JSON, or even a small image) and can be up to **512 MB**. The basics:

```text
127.0.0.1:6379> SET user:1:name "Ada"
OK
127.0.0.1:6379> GET user:1:name
"Ada"
127.0.0.1:6379> STRLEN user:1:name
(integer) 3
127.0.0.1:6379> APPEND user:1:name " Lovelace"
(integer) 12
```

`APPEND` returns the new length. `STRLEN` gives the current length.

### Atomic counters

If a string looks like an integer, Redis can do math on it **atomically** — no read-modify-write
race, because the whole command runs in one step:

- `INCR key` — add 1 (creating the key as `0` first if needed).
- `DECR key` — subtract 1.
- `INCRBY key n` / `DECRBY key n` — add/subtract `n`.
- `INCRBYFLOAT key n` — add a floating-point amount.

```text
127.0.0.1:6379> INCR page:home:views
(integer) 1
127.0.0.1:6379> INCRBY page:home:views 10
(integer) 11
```

Counters are 64-bit signed integers. `INCR` on a value that isn't a valid integer returns an
error rather than guessing.

### SET options and conditional writes

`SET` takes options that fold several behaviors into one atomic command:

- `EX seconds` / `PX milliseconds` — set the value **and** an expiry together.
- `NX` — only set **if the key does not exist**; `XX` — only **if it already exists**.
- `GET` — return the **old** value while setting the new one.
- `KEEPTTL` — keep the existing time-to-live instead of clearing it.

```text
127.0.0.1:6379> SET session:abc "user42" EX 3600 NX
OK
127.0.0.1:6379> SET session:abc "someone-else" NX
(nil)
```

The second `SET` returns `(nil)` because `NX` refused to overwrite the existing key. `SET ...
NX` is the seed of a lock, though — as a later lesson shows — a *correct* lock needs more than
this. The older single-purpose commands `SETNX` (set if not exists) and `SETEX` (set with
expiry) still exist, but `SET` with options is the modern, flexible way.

### Working with many keys at once

`MSET` and `MGET` set and get several keys in one round trip:

```text
127.0.0.1:6379> MSET color "red" size "M" qty 3
OK
127.0.0.1:6379> MGET color size qty
1) "red"
2) "M"
3) "3"
```

Fewer round trips means less network latency — a theme we'll return to with pipelining.

# Key Terminology

- **Keyspace** — the set of all keys in a database.
- **Binary-safe** — can contain any bytes, including nulls; not limited to printable text.
- **Glob pattern** — a wildcard match like `user:*` or `page:?:views` used by `KEYS`/`SCAN`.
- **Cursor** — the opaque position `SCAN` returns so the next call resumes where it left off;
  iteration is done when the cursor is `0`.
- **Atomic counter** — a numeric string updated with a single command (`INCR`, `INCRBY`) so no
  update is lost.

# Options and Trade-offs

Iterating the keyspace, and choosing how to store a couple of values:

| Option | What it does | Use when | Watch out for |
| ------ | ------------ | -------- | ------------- |
| **`KEYS pattern`** | Returns all matching keys at once | Debugging on a small/local DB | O(N); can block the whole server on a big keyspace |
| **`SCAN cursor`** | Iterates keys in small batches | Any production iteration | Weaker guarantees: possible duplicates; `COUNT` is a hint |
| **Many String keys** | One key per field (`user:1:name`, `user:1:email`) | Fields accessed independently, each may expire | More keys to manage; no single-object fetch |
| **One Hash key** | Fields grouped under one key (next lesson) | Fields belong to one object | TTL applies to the whole object, not per field |

# Worked Example

Model a simple page-view counter and a cached value with an expiry, then iterate keys safely:

```text
127.0.0.1:6379> INCR page:home:views
(integer) 1
127.0.0.1:6379> SET cache:home "<rendered html>" EX 60
OK
127.0.0.1:6379> TTL cache:home
(integer) 60
127.0.0.1:6379> EXISTS page:home:views cache:home
(integer) 2
127.0.0.1:6379> SCAN 0 MATCH page:* COUNT 50
1) "0"
2) 1) "page:home:views"
```

The counter increments atomically, the cache carries a 60-second life, `EXISTS` confirms both
keys, and `SCAN` finds the `page:*` keys without ever running `KEYS`.

# Real World Analogy

The keyspace is a giant coat-check. Each **key** is a numbered ticket; the **value** is the
coat. `KEYS *` is demanding the attendant bring out *every coat in the building at once* so you
can look — everyone else waits. `SCAN` is asking, "show me the next handful," again and again,
so the queue keeps moving while you browse.

# Examples

## Example 1 — Basic: a feature flag

Store a flag as a string: `SET feature:new-checkout on`. Your app reads it with `GET
feature:new-checkout` and flips behavior. Flip the flag for everyone by setting `off`. Simple,
instant, and centrally controlled.

**Why this works:** a string key is a perfect small piece of shared, quickly-readable state.

## Example 2 — Real-world: a hit counter that can't lose counts

Ten servers all serve the home page and all run `INCR page:home:views` on each hit. Because
`INCR` is atomic, none of the increments are lost even under heavy concurrency — the final count
is exactly the number of hits.

**Why this works:** atomicity is built into the command, so you don't need application-level
locking to avoid lost updates.

## Example 3 — Trade-off / pitfall: `KEYS *` in production

A developer runs `KEYS *` on a production server with 20 million keys to "just see what's
there." The command scans all 20 million keys in one shot, blocking every other client for
seconds; latency spikes and requests time out.

**Why this bites:** `KEYS` is O(N) and single-threaded like every command, so on a large
keyspace it becomes a self-inflicted outage. `SCAN` would have iterated harmlessly.

# Common Mistakes

- **Using `KEYS` in application code or on big servers.** Use `SCAN`. Reserve `KEYS` for small
  local databases.
- **Assuming `INCR` works on any string.** It only works on values that parse as a 64-bit
  integer; otherwise it errors.
- **Forgetting that a plain `SET` clears the TTL.** Overwriting a key with `SET` drops any
  existing expiry unless you pass `KEEPTTL`.
- **Storing huge blobs in one String.** Strings can reach 512 MB, but multi-megabyte values make
  every operation on them slow and memory spiky — keep values small.

# Best Practices

- Adopt a consistent **`colon:separated`** key-naming scheme and stick to it across the app.
- Prefer `SET key value EX seconds` to set a value and its lifetime in **one atomic command**.
- Use `INCR`/`INCRBY` for counters rather than reading and writing back from your app.
- Batch related reads/writes with `MGET`/`MSET` to cut round trips.
- Never let `KEYS` near production; make `SCAN` your default iterator.

# Summary

- Keys are binary-safe, **case-sensitive** names; convention is **`colon:separated`** segments.
- Manage keys with `EXISTS`, `DEL`, `TYPE`, `RENAME`.
- **`KEYS` is O(N) and can block the server** — iterate with cursor-based **`SCAN`** (weaker
  guarantees: possible duplicates, `COUNT` is a hint).
- **Strings** hold text, numbers, or small binaries up to **512 MB**.
- `INCR`/`INCRBY`/`INCRBYFLOAT` update counters **atomically**; `INCR` errors on non-integers.
- `SET` options (`EX`, `PX`, `NX`, `XX`, `GET`, `KEEPTTL`) combine behaviors; `MSET`/`MGET`
  handle several keys at once.

# Flash Cards

Q: Why is KEYS dangerous on a large production database?
A: It's O(N) over the whole keyspace and runs in the single command thread, so it can block every other client while it scans.

Q: What replaces KEYS for safe iteration, and how do you know it's finished?
A: SCAN — a cursor-based iterator; you're done when it returns a cursor of 0.

Q: What are SCAN's weaker guarantees compared to KEYS?
A: It may return duplicate keys, and COUNT is only a hint for work per call — but keys present for the whole iteration are returned at least once.

Q: What is the maximum size of a Redis String value?
A: 512 MB (and it's binary-safe).

Q: Why can many servers all run INCR on the same key without losing counts?
A: INCR is atomic — the whole increment happens in one indivisible command, so concurrent increments don't overwrite each other.

Q: What does `SET key val EX 60 NX` do?
A: Sets the key to val with a 60-second expiry, but only if the key does not already exist.

# Exercises

### Easy
Create `SET greeting "hi"`, read it with `GET`, check `STRLEN greeting`, then `APPEND
greeting " there"` and `GET` again. Note the length `APPEND` returned.

### Medium
Simulate a counter: run `INCR downloads` a few times, then `INCRBY downloads 100`. Now try
`SET downloads "lots"` followed by `INCR downloads` and explain the error you get.

### Challenging
Load 1,000 keys named `tmp:0` … `tmp:999` (a quick loop in your shell or a script). Iterate all
`tmp:*` keys using `SCAN` in a loop (feeding the returned cursor back in) and count them.
Explain why you'd never use `KEYS tmp:*` for this on a shared server.

# Further Reading

- Redis — *Redis Strings*: <https://redis.io/docs/latest/develop/data-types/strings/>
- Redis — *SET* command (all options): <https://redis.io/commands/set/>
- Redis — *SCAN* (and the cursor guarantees): <https://redis.io/commands/scan/>
- Redis — *INCR*: <https://redis.io/commands/incr/>
- Redis — *Keyspace*: <https://redis.io/docs/latest/develop/using-commands/keyspace/>
