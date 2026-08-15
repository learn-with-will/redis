---
id: lesson-08
slug: expiration-and-key-lifetime
title: "Expiration and Key Lifetime"
level: beginner
order: 8
duration: 22
tags:
  - expiration
  - ttl
  - eviction
  - caching
  - memory
summary: "How Redis keys live and die: setting TTLs with EXPIRE/TTL/PERSIST, how passive and active expiration actually work, how writes affect a TTL, and a first look at maxmemory and eviction."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Give keys a lifetime with `EXPIRE` / `PEXPIRE` / `EXPIREAT` and inspect it with `TTL`.
- Remove a lifetime with `PERSIST`, and read the two special `TTL` return values.
- Explain how Redis expires keys: **passively** (on access) and **actively** (in the
  background).
- Predict when a **write clears a TTL** and how to keep it.
- Describe, at a high level, the difference between **expiration** and **eviction**.

# Why It Matters

Expiration is what turns Redis into a great **cache**: put a value in, let it disappear on its
own after a while, and you never serve badly-stale data or leak memory on keys you've forgotten.
Sessions that time out, one-time tokens, rate-limit windows, cached pages — all of them lean on
TTLs. Understanding *exactly* how and when keys expire keeps you from subtle bugs like "why is
my cached value gone early?" or "why is memory still full of expired keys?"

# Concept Explanation

### Setting and reading a TTL

A **TTL** (time-to-live) is how long a key should live before Redis deletes it automatically.

- `EXPIRE key seconds` — delete the key after N seconds. Returns `1` if the timeout was set,
  `0` if the key doesn't exist.
- `PEXPIRE key milliseconds` — same, in milliseconds.
- `EXPIREAT key unix-seconds` / `PEXPIREAT key unix-ms` — expire at an **absolute** point in
  time.
- `TTL key` — seconds remaining; `PTTL key` — milliseconds remaining.
- `PERSIST key` — remove the TTL so the key lives until explicitly deleted.

Two special `TTL` return values are worth memorizing:

- `-1` — the key exists but has **no expiry**.
- `-2` — the key **does not exist** (already expired or never created).

```text
127.0.0.1:6379> SET session:abc "user42"
OK
127.0.0.1:6379> EXPIRE session:abc 60
(integer) 1
127.0.0.1:6379> TTL session:abc
(integer) 60
127.0.0.1:6379> PERSIST session:abc
(integer) 1
127.0.0.1:6379> TTL session:abc
(integer) -1
```

You can also set the TTL at write time — `SET session:abc "user42" EX 60` does the `SET` and
`EXPIRE` in one atomic command, which is usually what you want.

Since Redis 7.0, `EXPIRE` accepts conditions — `NX` (only if no TTL yet), `XX` (only if a TTL
exists), `GT`/`LT` (only if the new TTL is greater/less than the current one) — handy for
"extend but never shorten" logic.

### How keys actually expire

It's tempting to imagine a precise timer firing the instant a key's TTL hits zero. Redis does
**not** work that way. It uses two mechanisms together:

1. **Passive (lazy) expiration.** When a client touches a key, Redis checks whether it has
   expired; if so, it deletes it then and there and behaves as if the key was missing. So an
   expired key you never access again isn't necessarily gone yet.
2. **Active expiration.** A background routine runs many times per second, **samples** a batch of
   keys that have TTLs, and deletes the expired ones. If it finds a lot expired, it repeats to
   catch up. This keeps the fraction of "expired but not yet reclaimed" keys low without scanning
   everything.

The practical takeaways: expiration is **eventually** enforced, not to-the-millisecond precise;
and a key is guaranteed *logically* gone the moment it expires (a read will never return an
expired value), even if the memory is reclaimed a little later.

> On a **replica**, keys are not expired independently. The primary decides when a key expires
> and sends the delete to replicas, so both stay consistent; a replica will still report an
> expired key as missing to reads.

### Writes and the TTL

A common surprise: **overwriting a key with a plain `SET` removes its TTL.** The new value is
treated as a fresh key with no expiry unless you say otherwise:

```text
127.0.0.1:6379> SET k "v" EX 100
OK
127.0.0.1:6379> TTL k
(integer) 100
127.0.0.1:6379> SET k "v2"
OK
127.0.0.1:6379> TTL k
(integer) -1
```

To keep the existing TTL, use `SET k "v2" KEEPTTL`. Commands that *modify* a value in place
(like `APPEND`, `INCR`, `HSET` on an existing key, `LPUSH`) generally **keep** the TTL — it's the
full-replacement `SET` that clears it. You can also read-and-re-arm in one step with `GETEX`
(e.g. `GETEX key EX 60` reads the value and refreshes its expiry).

### Expiration vs. eviction (a preview)

**Expiration** is per-key and deliberate: *you* set a TTL, and the key dies when it's due.
**Eviction** is different: when Redis hits a memory limit (`maxmemory`), it may remove keys —
even ones with no TTL — according to an **eviction policy**, to make room. Expiration is "this
key had a deadline"; eviction is "we're out of room, something has to go." A later lesson covers
memory and eviction in full; for now, just know they're distinct.

# Key Terminology

- **TTL (time-to-live)** — how long a key lives before automatic deletion.
- **Passive/lazy expiration** — deleting an expired key when it's next accessed.
- **Active expiration** — a background cycle that samples keys with TTLs and removes expired
  ones.
- **`PERSIST`** — remove a key's TTL so it no longer expires.
- **Eviction** — removing keys under memory pressure per a policy (distinct from expiration).

# Options and Trade-offs

Ways to give a key a lifetime:

| Approach | What it does | Use when | Watch out for |
| -------- | ------------ | -------- | ------------- |
| **`SET key val EX n`** | Set value + relative TTL atomically | The usual cache write | A later plain `SET` clears the TTL |
| **`EXPIRE key n`** | Add/replace a relative TTL on an existing key | You set the value earlier | Returns 0 (no-op) if the key is gone |
| **`EXPIREAT key ts`** | Expire at an absolute time | "Die at midnight" style deadlines | Uses server clock; past time deletes now |
| **`PERSIST key`** | Remove the TTL | Promote a cached key to permanent | Now it's your job to delete it |

# Worked Example

A one-time verification code that must self-destruct after 5 minutes, plus proof that a plain
overwrite drops the TTL:

```text
127.0.0.1:6379> SET verify:user42 "839201" EX 300
OK
127.0.0.1:6379> TTL verify:user42
(integer) 300
127.0.0.1:6379> SET verify:user42 "000000"
OK
127.0.0.1:6379> TTL verify:user42
(integer) -1
127.0.0.1:6379> SET verify:user42 "111111" KEEPTTL
OK
127.0.0.1:6379> TTL verify:user42
(integer) -1
```

The code starts with a 5-minute life. The bare `SET` wipes the TTL (`-1`). Note `KEEPTTL` can
only *keep* a TTL that still exists — since the previous `SET` already cleared it, there's
nothing left to keep, so it stays `-1`. Lesson: set the TTL and don't blow it away with careless
overwrites.

# Real World Analogy

A TTL is a **carton's best-by date**. Passive expiration is you opening the fridge, seeing the
date has passed, and throwing the carton out right then. Active expiration is the periodic
fridge clear-out that sweeps expired cartons even if you haven't reached for them. Either way,
you'll never *drink* expired milk (a read never returns an expired key) — the only question is
exactly when the empty space is reclaimed.

# Examples

## Example 1 — Basic: an auto-expiring cache entry

`SET cache:profile:42 "<json>" EX 120` caches a profile for two minutes. Reads are instant for
two minutes; then the key disappears and the next read misses the cache and refetches. No cleanup
code required.

**Why this works:** the TTL makes the cache self-maintaining — stale data ages out on its own.

## Example 2 — Real-world: a fixed-window rate limit

Allow 100 requests per minute per user: `INCR rate:user42`, and on the first hit set `EXPIRE
rate:user42 60`. While the counter is under 100 and the key lives, allow; when the key expires,
the window resets to zero automatically.

**Why this works:** the expiring counter *is* the time window — when it expires, the limit resets
with no scheduled job.

## Example 3 — Trade-off / pitfall: the accidental TTL wipe

Code sets a session with `SET session:abc <data> EX 1800`, then later "updates" it with a plain
`SET session:abc <newdata>` — silently removing the 30-minute expiry. The session now never times
out, quietly leaking memory and security.

**Why this bites:** a full-replacement `SET` clears the TTL. Use `KEEPTTL`, re-set the expiry, or
update in place with a command that preserves the TTL.

# Common Mistakes

- **Assuming millisecond-precise expiry.** Expiration is passive + active, so reclamation is
  eventual (though reads never see an expired value).
- **Overwriting a key with `SET` and losing the TTL.** Use `KEEPTTL` or re-apply `EXPIRE`.
- **Misreading `TTL` results.** `-1` = no expiry; `-2` = key gone. They're different.
- **Confusing expiration with eviction.** TTLs are deadlines you set; eviction is memory-pressure
  cleanup driven by a policy.

# Best Practices

- Prefer `SET key val EX seconds` to set value and lifetime in one atomic step.
- After modifying a key that must keep expiring, confirm the TTL survived (or re-arm it with
  `EXPIRE`/`KEEPTTL`/`GETEX`).
- Use `EXPIREAT` for wall-clock deadlines ("expire at end of day"); use `EXPIRE` for durations.
- Give cache keys a TTL by default so nothing lingers forever by accident.

# Summary

- A **TTL** is a key's lifetime; set it with `EXPIRE`/`PEXPIRE`/`EXPIREAT` (or `SET ... EX`), read
  it with `TTL`/`PTTL`, remove it with `PERSIST`.
- `TTL` returns seconds left, `-1` for **no expiry**, or `-2` for a **missing key**.
- Redis expires keys **passively** (on access) and **actively** (background sampling) — eventual,
  not to-the-millisecond, but reads never return expired values.
- A plain **`SET` clears the TTL**; use `KEEPTTL` (or re-apply it) to preserve it. In-place edits
  usually keep the TTL.
- **Expiration** (per-key deadlines you set) is distinct from **eviction** (memory-pressure
  cleanup by policy) — more on eviction later.

# Flash Cards

Q: What does TTL return for a key that exists but has no expiry, versus a key that doesn't exist?
A: -1 for "exists, no expiry"; -2 for "the key does not exist."

Q: What are the two mechanisms Redis uses to expire keys?
A: Passive/lazy expiration (deleted when next accessed) and active expiration (a background cycle that samples keys with TTLs).

Q: Is expiration precise to the millisecond?
A: No — reclamation is eventual (passive + active), though a read will never return an expired value.

Q: What happens to a key's TTL if you overwrite it with a plain SET?
A: The TTL is cleared; use SET ... KEEPTTL (or re-apply EXPIRE) to preserve it.

Q: How is expiration different from eviction?
A: Expiration removes a key when its own TTL is due; eviction removes keys (even without TTLs) under maxmemory pressure according to a policy.

Q: Which single command sets a value and its expiry atomically?
A: SET key value EX seconds (or PX milliseconds).

# Exercises

### Easy
`SET token "x" EX 30`, check `TTL token`, then `PERSIST token` and check `TTL token` again.
Explain the two numbers you saw.

### Medium
Reproduce the TTL wipe: `SET k "a" EX 100`, confirm `TTL k`, then `SET k "b"` and check `TTL k`.
Now redo it with `SET k "b" KEEPTTL` starting from a key that still has a TTL, and explain the
difference.

### Challenging
Build a fixed-window rate limiter in `redis-cli`: `INCR rl:u1`; if the result is 1, `EXPIRE rl:u1
60`. Increment a few times and watch `TTL rl:u1` count down. Describe what happens when the key
expires and why that resets the limit — and one edge case of the fixed-window approach.

# Further Reading

- Redis — *Key expiration* (EXPIRE and how it works): <https://redis.io/commands/expire/>
- Redis — *TTL* / *PERSIST*: <https://redis.io/commands/ttl/>
- Redis — *Redis keyspace* (expiry & how keys are removed): <https://redis.io/docs/latest/develop/using-commands/keyspace/>
- Redis — *GETEX*: <https://redis.io/commands/getex/>
