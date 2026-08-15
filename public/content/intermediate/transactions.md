---
id: lesson-12
slug: transactions
title: "Transactions"
level: intermediate
order: 12
duration: 22
tags:
  - transactions
  - multi-exec
  - watch
  - optimistic-locking
  - atomicity
summary: "Redis transactions with MULTI/EXEC/DISCARD: how commands are queued and run without interleaving, why there is NO rollback on errors, and how WATCH provides optimistic locking (check-and-set)."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Queue and run a group of commands atomically with `MULTI` / `EXEC` (and abort with `DISCARD`).
- Explain the two kinds of transaction errors and why Redis has **no rollback**.
- Use `WATCH` for **optimistic locking** (check-and-set) and retry on conflict.
- Distinguish a Redis transaction from a SQL transaction and from pipelining.

# Why It Matters

Sometimes several commands must happen together as a unit — move a value from one key to another,
update two counters that must agree, reserve an item only if it's still available. Redis
**transactions** let you run a batch of commands with the guarantee that **no other client's
commands run in the middle**. But Redis transactions behave differently from SQL ones in a way
that trips people up — most importantly, they **don't roll back** — so understanding exactly what
they promise matters.

# Concept Explanation

### MULTI, EXEC, DISCARD

A transaction has three steps:

1. `MULTI` — begin. From now on, commands you send are **queued**, not executed; each returns
   `QUEUED`.
2. Send the commands you want to group.
3. `EXEC` — run **all** queued commands, one after another, with **no other client interleaving**.
   `EXEC` returns an array of each command's reply.

`DISCARD` throws away the queued commands and ends the transaction without running anything.

```text
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> INCR points
QUEUED
127.0.0.1:6379> INCRBY points 10
QUEUED
127.0.0.1:6379> EXEC
1) (integer) 1
2) (integer) 11
```

Between `MULTI` and `EXEC` nothing has actually changed yet; `EXEC` applies the whole batch as one
uninterrupted unit. That **isolation** — no interleaving — is the core guarantee.

### The big surprise: no rollback

This is the fact to burn in: **Redis transactions do not roll back.** There are two error cases,
and they behave differently:

- **Error while queuing (before `EXEC`).** If a command can't even be queued — e.g. a syntax error
  or an unknown command — Redis flags the transaction, and `EXEC` **aborts the whole thing**
  (returning an `EXECABORT` error); none of the commands run.
- **Error while executing (during `EXEC`).** If a queued command is well-formed but fails at run
  time — the classic example is running a list command against a key holding a string — that one
  command returns an error, but **every other command in the transaction still runs**. There is no
  undo of the ones that succeeded.

```text
127.0.0.1:6379> SET name "Ada"
OK
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> INCR name
QUEUED
127.0.0.1:6379> SET flag "on"
QUEUED
127.0.0.1:6379> EXEC
1) (error) WRONGTYPE Operation against a key holding the wrong kind of value
2) OK
```

`INCR name` failed (it's a string, not a number), but `SET flag "on"` still executed. So Redis
gives you **atomicity in the sense of "no interleaving,"** not the SQL sense of "all-or-nothing
with rollback."

### WATCH: optimistic locking

What if a transaction should only proceed if some key hasn't changed since you read it? That's
**check-and-set (CAS)**, and `WATCH` provides it:

1. `WATCH key [key ...]` — mark keys to watch.
2. Read them and decide what to do.
3. `MULTI` … your commands … `EXEC`.

If **any watched key was modified by anyone** between the `WATCH` and the `EXEC`, `EXEC` does
nothing and returns `(nil)` — a signal that the world changed under you, so you should **retry**.
`UNWATCH` clears watches without executing.

```text
127.0.0.1:6379> WATCH seat:12
OK
127.0.0.1:6379> GET seat:12
"free"
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> SET seat:12 "taken"
QUEUED
127.0.0.1:6379> EXEC
1) OK
```

If another client had grabbed `seat:12` after the `WATCH`, `EXEC` would return `(nil)` and the
seat would not be double-booked. This is **optimistic** locking: you don't hold a lock, you just
detect a conflict and retry — great when conflicts are rare.

### Transactions vs pipelining vs SQL

- **Pipelining** (a later lesson) just sends many commands without waiting for each reply; it's a
  **latency** optimization with **no atomicity**. A transaction adds the no-interleaving guarantee.
- **A SQL transaction** offers full ACID with **rollback**; a Redis transaction offers isolation
  and atomic application but **no rollback**. For complex conditional logic, a **Lua script** or
  **Redis Function** (next lesson) is often a cleaner atomic alternative.

# Key Terminology

- **`MULTI` / `EXEC`** — begin a transaction / run all queued commands atomically.
- **`DISCARD`** — abandon a queued transaction without executing.
- **Queued** — a command accepted into the transaction but not yet run.
- **`WATCH`** — mark keys so `EXEC` aborts if they changed (optimistic locking / CAS).
- **No rollback** — a run-time error in one command doesn't undo the others.

# Options and Trade-offs

Ways to make several operations act as one:

| Approach | Atomic? | Rollback? | Conditional logic | Use when |
| -------- | ------- | --------- | ----------------- | -------- |
| **MULTI/EXEC** | Yes (no interleaving) | No | Limited (fixed queued commands) | A fixed batch must apply together |
| **MULTI/EXEC + WATCH** | Yes | No (retries on conflict) | Check-and-set | "Only if this key hasn't changed" |
| **Lua script / Function** | Yes (runs atomically) | No | Full (branching, loops) | Read-compute-write logic in one step |
| **Pipelining** | No | No | No | Just cutting round-trip latency |

# Worked Example

Transfer 50 points between two users only if the sender still has enough — using `WATCH` to detect
concurrent changes:

```text
127.0.0.1:6379> MSET points:alice 100 points:bob 0
OK
127.0.0.1:6379> WATCH points:alice
OK
127.0.0.1:6379> GET points:alice
"100"
# app checks 100 >= 50, so proceed
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> DECRBY points:alice 50
QUEUED
127.0.0.1:6379> INCRBY points:bob 50
QUEUED
127.0.0.1:6379> EXEC
1) (integer) 50
2) (integer) 50
```

If another client had changed `points:alice` after the `WATCH`, `EXEC` would return `(nil)` and the
app would loop back to `WATCH` and try again — never applying a transfer based on a stale balance.

# Real World Analogy

`MULTI`/`EXEC` is handing a cashier a **stack of instructions to run without pausing** — they do
the whole stack before serving the next customer (isolation). But there's **no manager to reverse
charges**: if one instruction is nonsense at run time, the cashier skips it and keeps going (no
rollback). `WATCH` is putting a sticky note on an item saying "only ring this up if nobody else
touched it" — if someone did, the whole order is voided and you start over.

# Examples

## Example 1 — Basic: two counters that must move together

`MULTI` → `INCR stats:requests` → `INCR stats:today` → `EXEC`. Both counters advance as one unit,
with no other client's commands slipping between them.

**Why this works:** `EXEC` applies the queued commands without interleaving, so the two counters
never disagree due to a concurrent read in the middle.

## Example 2 — Real-world: reserve a unique username

`WATCH user:name:ada`; if `GET` shows it's free, `MULTI`/`SET`/`EXEC`. If a concurrent signup grabs
the name first, the watched key changes, `EXEC` returns `(nil)`, and you report "username taken"
instead of overwriting.

**Why this works:** optimistic locking detects the race and refuses the stale write — no duplicate
usernames.

## Example 3 — Trade-off / pitfall: expecting a rollback

Code queues `DECRBY balance 100` and then a command that errors at run time, assuming "if anything
fails, nothing applies." But the `DECRBY` already ran — money left the balance while the later step
failed, and nothing rolled it back.

**Why this bites:** Redis has no rollback. To make "all-or-nothing" conditional logic truly atomic,
put the check and the writes in a **Lua script**, which runs as one uninterruptible unit and lets
you branch *before* writing.

# Common Mistakes

- **Expecting SQL-style rollback.** A run-time error doesn't undo earlier commands in the
  transaction.
- **Ignoring a `(nil)` from `EXEC`.** With `WATCH`, `(nil)` means a watched key changed — you must
  retry, not assume success.
- **Doing reads inside `MULTI` and branching on them.** Queued commands don't return values until
  `EXEC`, so you can't read-then-decide inside the transaction — that's what `WATCH` (or a script)
  is for.
- **Reaching for `MULTI` when a Lua script fits better.** For read-compute-write logic, one script
  is usually simpler and safer.

# Best Practices

- Use `MULTI`/`EXEC` for a **fixed group** of commands that must apply without interleaving.
- Use `WATCH` for **check-and-set**, and always handle the `(nil)` retry path.
- For anything with **branching or computed values**, prefer a **Lua script** or **Redis
  Function** over a transaction.
- Keep transactions **short**; like everything else, `EXEC` blocks the single command thread while
  it runs.

# Summary

- `MULTI` queues commands; `EXEC` runs them all with **no other client interleaving**; `DISCARD`
  aborts.
- Redis transactions have **no rollback**: a queuing error aborts the whole `EXEC`, but a run-time
  error in one command lets the others proceed.
- `WATCH` gives **optimistic locking** — if a watched key changes before `EXEC`, `EXEC` returns
  `(nil)` and you retry.
- A Redis transaction is **isolation + atomic application**, not SQL ACID with rollback; for
  conditional atomic logic, use a **Lua script / Function**.

# Flash Cards

Q: What does MULTI/EXEC guarantee?
A: The queued commands run as one unit with no other client's commands interleaving between them (isolation).

Q: Does Redis roll back a transaction if one command errors during EXEC?
A: No — Redis has no rollback; the failing command errors but the other queued commands still execute.

Q: What's the difference between a queuing-time error and a run-time error in a transaction?
A: A queuing error (e.g. bad syntax) makes EXEC abort everything; a run-time error (e.g. wrong type) fails just that command while the rest still run.

Q: What does WATCH provide?
A: Optimistic locking (check-and-set): if any watched key is modified before EXEC, EXEC aborts and returns nil so you can retry.

Q: What does EXEC return when a watched key was changed by another client?
A: (nil) — signaling the transaction did not run and you should retry.

Q: For read-compute-write logic that must be atomic and can branch, what's often better than MULTI/EXEC?
A: A Lua script or a Redis Function, which runs atomically and can make decisions before writing.

# Exercises

### Easy
Run `MULTI`, queue `SET a 1` and `SET b 2`, then `EXEC`. Confirm both keys exist. Repeat but
`DISCARD` instead of `EXEC`, and confirm nothing changed.

### Medium
Create `SET name "Ada"`. In a transaction, queue `INCR name` (which will fail at run time) followed
by `SET ok "yes"`, then `EXEC`. Observe that `ok` was set despite the error, and explain what this
proves about rollback.

### Challenging
Implement a safe "claim a seat" flow with `WATCH seat:1`: read it, and only if it's `free`, run a
`MULTI`/`SET seat:1 taken`/`EXEC`. In a second `redis-cli`, change `seat:1` after your `WATCH` but
before your `EXEC`, and show that `EXEC` returns `(nil)`. Describe the retry loop you'd write around
this.

# Further Reading

- Redis — *Transactions*: <https://redis.io/docs/latest/develop/interact/transactions/>
- Redis — *MULTI* / *EXEC* / *DISCARD*: <https://redis.io/commands/multi/>
- Redis — *WATCH*: <https://redis.io/commands/watch/>
