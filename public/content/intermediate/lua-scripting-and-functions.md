---
id: lesson-13
slug: lua-scripting-and-functions
title: "Lua Scripting and Functions"
level: intermediate
order: 13
duration: 24
tags:
  - lua
  - scripting
  - eval
  - functions
  - atomicity
summary: "Run custom logic atomically inside Redis with Lua: EVAL/EVALSHA, KEYS and ARGV, and why scripts are atomic. Plus Redis Functions (FUNCTION LOAD/FCALL) — the modern, persisted way to ship server-side logic."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Run a Lua script with `EVAL`, passing keys and arguments via `KEYS` and `ARGV`.
- Explain why a script executes **atomically** and why it must stay **fast**.
- Cache and reuse scripts with `SCRIPT LOAD` and `EVALSHA`.
- Register and call reusable server-side logic with **Redis Functions** (`FUNCTION LOAD`, `FCALL`).
- Decide when scripting beats multiple round trips or a transaction.

# Why It Matters

Some logic needs to be **read, decided, and written in one atomic step** — "if the counter is
below the limit, increment it and return allowed," "pop the highest-priority job and record who
took it." Doing that with separate commands invites races; doing it with `WATCH` means retry loops.
A **Lua script** runs *inside* Redis as a single uninterruptible unit, so the read and the write
can't be split apart — and it saves round trips. Redis 7 added **Functions**, a first-class,
persisted way to manage that server-side logic.

# Concept Explanation

### EVAL: run a script

`EVAL script numkeys key [key ...] arg [arg ...]` runs a Lua script on the server. You tell Redis
how many of the following arguments are **keys** (`numkeys`); those land in the `KEYS` table, and
the rest land in `ARGV`. Both are **1-indexed** Lua tables. Inside the script, `redis.call(...)`
runs Redis commands.

```text
127.0.0.1:6379> EVAL "return redis.call('SET', KEYS[1], ARGV[1])" 1 greeting "hello"
OK
127.0.0.1:6379> GET greeting
"hello"
```

Here `numkeys` is `1`, so `greeting` is `KEYS[1]` and `"hello"` is `ARGV[1]`. Passing keys through
`KEYS` (rather than hard-coding them) is important: it's how Redis knows which keys a script
touches, which matters for Cluster routing.

A slightly richer script — a conditional counter — shows the value of doing logic server-side:

```lua
-- KEYS[1] = counter key, ARGV[1] = limit
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current < tonumber(ARGV[1]) then
  return redis.call('INCR', KEYS[1])
else
  return -1
end
```

This reads, compares, and conditionally increments **atomically** — no other client can slip in
between the `GET` and the `INCR`.

### Atomicity (and the responsibility that comes with it)

A script runs **atomically**: because Redis executes commands in a single thread, the whole script
runs start-to-finish with nothing else interleaved — just like `MULTI`/`EXEC`, but with real
branching and computation. The flip side: **while your script runs, the entire server is blocked.**
A slow script (big loops, huge ranges) freezes every other client. So keep scripts **short and
fast**, and never write unbounded loops.

`redis.call()` raises an error that aborts the script if a command fails; `redis.pcall()` returns
the error as a value so you can handle it yourself.

> **Determinism & replication:** modern Redis replicates a script's **effects** (the actual writes
> it performs) rather than the script text, so using time or randomness inside a script no longer
> risks diverging replicas. It's still wise to keep scripts predictable and side-effect-focused.

### EVALSHA: don't resend the script every time

Sending the full script text on every call wastes bandwidth. Redis caches scripts by their
**SHA-1 hash**:

- `SCRIPT LOAD "<script>"` — load a script and get its SHA-1 back (without running it).
- `EVALSHA <sha1> numkeys ...` — run the cached script by hash.

If the server hasn't seen that hash (e.g. after a restart), `EVALSHA` returns a `NOSCRIPT` error and
the client falls back to `EVAL` (which re-caches it). Most client libraries handle this dance for
you.

### Redis Functions: the modern, persisted approach

`EVAL`/`EVALSHA` scripts are effectively an **ephemeral cache** — they aren't saved with your data
and vanish on restart until re-loaded. **Redis Functions** (added in **Redis 7.0**) make
server-side logic **first-class**: you load a **library** of named functions once, and they are
**persisted** (in RDB/AOF) and **replicated** like data.

```lua
#!lua name=mylib
redis.register_function('add_if_below', function(keys, args)
  local current = tonumber(redis.call('GET', keys[1]) or '0')
  if current < tonumber(args[1]) then
    return redis.call('INCR', keys[1])
  end
  return -1
end)
```

Load it with `FUNCTION LOAD "<library source>"`, then call a function by name:

```text
127.0.0.1:6379> FCALL add_if_below 1 counter 5
(integer) 1
```

`FCALL name numkeys key ... arg ...` mirrors `EVAL`'s key/arg convention. Because functions are
named, versioned as a library, and stored with the dataset, they're the recommended way to ship
reusable logic — while `EVAL` remains handy for one-off scripts.

# Key Terminology

- **`EVAL`** — run a Lua script, with `numkeys` telling Redis how many arguments are keys.
- **`KEYS` / `ARGV`** — 1-indexed Lua tables of the key names and the other arguments.
- **`redis.call` / `redis.pcall`** — call a Redis command from Lua (raising vs. returning errors).
- **`EVALSHA`** — run a script cached by its SHA-1 hash; `SCRIPT LOAD` preloads it.
- **Redis Function** — a named function in a loaded, **persisted**, replicated library, called with
  `FCALL`.

# Options and Trade-offs

Ways to run multi-step logic atomically:

| Approach | Atomic? | Branching/loops | Persisted with data | Best for |
| -------- | ------- | --------------- | ------------------- | -------- |
| **Multiple commands** | No | In your app (races) | n/a | Simple, independent operations |
| **MULTI/EXEC (+WATCH)** | Yes (no interleave) | No (or retry via WATCH) | n/a | A fixed batch / check-and-set |
| **EVAL / EVALSHA** | Yes | Yes | No (script cache) | One-off atomic logic; hot paths |
| **Redis Functions (FCALL)** | Yes | Yes | Yes (RDB/AOF, replicated) | Reusable, managed server-side logic |

# Worked Example

A rate limiter that checks a limit and increments in one atomic step (no race, no retry loop):

```text
127.0.0.1:6379> SET rl:user42 0
OK
127.0.0.1:6379> EVAL "local n=tonumber(redis.call('GET',KEYS[1]) or '0') if n<tonumber(ARGV[1]) then return redis.call('INCR',KEYS[1]) else return -1 end" 1 rl:user42 3
(integer) 1
127.0.0.1:6379> EVAL "local n=tonumber(redis.call('GET',KEYS[1]) or '0') if n<tonumber(ARGV[1]) then return redis.call('INCR',KEYS[1]) else return -1 end" 1 rl:user42 3
(integer) 2
127.0.0.1:6379> EVAL "local n=tonumber(redis.call('GET',KEYS[1]) or '0') if n<tonumber(ARGV[1]) then return redis.call('INCR',KEYS[1]) else return -1 end" 1 rl:user42 3
(integer) 3
127.0.0.1:6379> EVAL "local n=tonumber(redis.call('GET',KEYS[1]) or '0') if n<tonumber(ARGV[1]) then return redis.call('INCR',KEYS[1]) else return -1 end" 1 rl:user42 3
(integer) -1
```

The limit is 3. The first three calls increment and return the new count; the fourth sees the limit
reached and returns `-1` — all decided *inside* Redis, so two concurrent requests can never both
slip past the limit.

# Real World Analogy

A Lua script is a **note you hand the librarian**: "check if this book is on the shelf, and if so,
check it out to me — all before helping anyone else." The librarian does the whole errand without
pausing (atomic), so nobody grabs the book between your check and your checkout. A **Redis
Function** is the same errand written into the library's **official procedures binder**: named,
kept on file, and available to every librarian on every day — not a scrap of paper that's forgotten
overnight.

# Examples

## Example 1 — Basic: atomic "set if greater"

A script that sets a key only if the new value exceeds the stored one (a high-water mark): read the
current value, compare with `ARGV[1]`, and `SET` only when larger — all in one call, so two updates
can't clobber each other.

**Why this works:** the compare-and-set happens atomically inside Redis, eliminating the race a
`GET` then `SET` from the app would have.

## Example 2 — Real-world: reusable logic with Functions

A team packages several domain operations (reserve inventory, award points, dequeue-and-log) into a
`FUNCTION LOAD`ed library. Every service calls them with `FCALL`, and the logic is versioned,
persisted, and replicated with the data — no copy-pasted scripts drifting across services.

**Why this works:** Functions turn ad-hoc scripts into managed, shared server-side procedures.

## Example 3 — Trade-off / pitfall: the slow script that froze the server

Someone writes a script that loops over a million-element structure to "clean it up." While it runs,
Redis is single-threaded and blocked — every other client stalls for seconds and requests time out.

**Why this bites:** a script's atomicity comes from monopolizing the one command thread. Long-running
logic weaponizes that. Keep scripts tiny and bounded; do heavy work in batches from the client
instead.

# Common Mistakes

- **Hard-coding key names instead of using `KEYS`.** It breaks Cluster routing and hides which keys
  the script touches.
- **Writing slow/unbounded scripts.** They block the whole server; keep them short.
- **Assuming `EVALSHA` always works.** After a restart the script may be uncached (`NOSCRIPT`) —
  fall back to `EVAL`.
- **Using `EVAL` for logic you reuse everywhere.** For shared, managed logic, prefer **Functions**
  (persisted and named) over scattering script text through your codebase.

# Best Practices

- Pass every key the script touches through **`KEYS`**; put other inputs in `ARGV`.
- Keep scripts **short, deterministic, and bounded** — they run with the server's full attention.
- Preload hot scripts with `SCRIPT LOAD` and call them via `EVALSHA` (with an `EVAL` fallback).
- Package **reusable** logic as **Redis Functions** so it's persisted, replicated, and named.
- Reach for scripting when you need **atomic read-compute-write**; use plain commands when you don't.

# Summary

- `EVAL script numkeys ...` runs Lua on the server; keys go in `KEYS`, other args in `ARGV`
  (1-indexed); `redis.call` invokes commands.
- Scripts run **atomically** (single-threaded), so they must be **fast** — a slow script blocks
  everyone.
- `SCRIPT LOAD` + `EVALSHA` run a cached script by SHA-1; handle `NOSCRIPT` by falling back to
  `EVAL`.
- **Redis Functions** (`FUNCTION LOAD` + `FCALL`, Redis 7.0+) are named, **persisted**, replicated
  libraries — the modern way to ship reusable server-side logic.
- Prefer scripting/Functions for **atomic read-compute-write**; keep it small and pass keys via
  `KEYS`.

# Flash Cards

Q: In EVAL, how does Redis know which arguments are keys?
A: The numkeys argument says how many of the following arguments are keys; they populate the KEYS table, the rest populate ARGV.

Q: Why must Lua scripts be fast?
A: A script runs atomically on the single command thread, so a slow script blocks every other client for its entire duration.

Q: What do SCRIPT LOAD and EVALSHA do together?
A: SCRIPT LOAD caches a script and returns its SHA-1; EVALSHA runs the cached script by that hash, saving bandwidth (falling back to EVAL on NOSCRIPT).

Q: How do Redis Functions differ from EVAL scripts?
A: Functions are named, loaded as a library, and persisted with the dataset (RDB/AOF) and replicated; EVAL scripts are an ephemeral cache that vanishes on restart until re-loaded.

Q: Why pass key names through KEYS instead of hard-coding them?
A: So Redis knows which keys the script accesses — essential for correct routing in Redis Cluster.

Q: When is a Lua script better than MULTI/EXEC?
A: When you need branching or computed values in an atomic read-compute-write — a script can decide before writing, which a transaction cannot.

# Exercises

### Easy
Run `EVAL "return redis.call('SET', KEYS[1], ARGV[1])" 1 mykey "hi"` then `GET mykey`. Identify which
argument became `KEYS[1]` and which became `ARGV[1]`.

### Medium
Write and run a script that returns `1` if a key exists and `0` otherwise, using `redis.call('EXISTS',
KEYS[1])`. Then `SCRIPT LOAD` it, note the SHA-1, and run it again with `EVALSHA`.

### Challenging
Implement the conditional rate limiter from the lesson as a **Redis Function**: write a `#!lua
name=...` library that registers `allow_request`, `FUNCTION LOAD` it, and call it with `FCALL`.
Explain one advantage the Function form has over pasting the same `EVAL` into three different
services.

# Further Reading

- Redis — *Scripting with Lua*: <https://redis.io/docs/latest/develop/programmability/eval-intro/>
- Redis — *Redis Functions*: <https://redis.io/docs/latest/develop/programmability/functions-intro/>
- Redis — *EVAL* / *EVALSHA* / *SCRIPT LOAD*: <https://redis.io/commands/eval/>
- Redis — *FUNCTION LOAD* / *FCALL*: <https://redis.io/commands/fcall/>
