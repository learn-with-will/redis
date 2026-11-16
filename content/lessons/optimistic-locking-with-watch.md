---
slug: optimistic-locking-with-watch
title: Optimistic Concurrency Control with WATCH and UNWATCH
topic: transactions-and-scripting
kind: pattern
summary: Implement check-and-set optimistic locking using WATCH to abort transactions if monitored keys are modified.
tags:
  - watch
  - optimistic-locking
  - transactions
  - concurrency
related:
  - transactions-multi-and-exec
  - discard-and-transaction-lifecycle
  - lua-scripting-basics-eval
---
> **In one line:** `WATCH` monitors keys for changes before `EXEC`, aborting the transaction if another client mutates them.

## The idea

Because commands inside a `MULTI` block cannot inspect intermediate values before executing, how can an application read a value, perform custom business logic in application code, and safely update the key without a race condition?

Redis provides **optimistic locking** via the `WATCH` command (implementing the classic **Check-And-Set (CAS)** pattern). When you `WATCH` a key, Redis monitors it. If any other client connection modifies that key before your `EXEC` is executed, Redis automatically discards the entire transaction, returning `(nil)`.

| Command | Arguments | Behavior |
|---|---|---|
| `WATCH key [key ...]` | One or more keys | Monitors keys for mutations until `EXEC` or `UNWATCH` |
| `UNWATCH` | None | Clears all watched keys on the connection |
| `EXEC` | None | Commits transaction; fails with `(nil)` if watched keys changed |
| `DISCARD` | None | Aborts transaction and automatically unmonitors keys |

> **Tip:** Optimistic locking assumes collisions are rare. If a conflict occurs, the client simply catches the `nil` reply and retries the read-modify-write cycle.

## See it

Simulating optimistic locking and collision detection in `redis-cli`:

```bash
# Initialize inventory count
SET product:42:stock 1

# Client 1 monitors the stock key
WATCH product:42:stock
# Returns: OK

# Client 1 reads current stock in application code
GET product:42:stock
# Returns: "1" (Stock is available!)

# Client 1 begins transaction
MULTI
DECR product:42:stock

# Concurrent Client 2 steps in and purchases the item first!
# (From another terminal: SET product:42:stock 0)

# Client 1 attempts to commit its transaction:
EXEC
# Returns: (nil) -> TRANSACTION ABORTED!
```

Because Client 2 mutated `product:42:stock` while Client 1 was watching it, Client 1's transaction failed safely, preventing overselling.

## Go deeper

When a key is watched, Redis sets a dirty flag on any connection monitoring that key whenever a write operation mutates it. Calling `EXEC` checks this flag: if set, the transaction fails immediately.

Calling `EXEC` or `DISCARD` automatically un-watches all keys on that connection. If an application decides not to proceed with a transaction after calling `WATCH`, it should execute `UNWATCH` to release the monitoring hooks on the connection.

## Watch out

- Expirations and automatic evictions count as mutations; if a watched key expires before `EXEC`, the transaction aborts.
- Under extreme concurrent write contention, optimistic locking loops can suffer from high retry rates; use Lua scripts instead.

## Remember

- `WATCH` provides check-and-set optimistic locking without blocking other clients.
- If any watched key is mutated prior to `EXEC`, the transaction returns `(nil)`.
- Client applications handle conflict by retrying the read-modify-write loop.
