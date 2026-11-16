---
slug: discard-and-transaction-lifecycle
title: Aborting Transactions with DISCARD
topic: transactions-and-scripting
kind: api
summary: Flush queued transaction commands and reset connection state cleanly using the DISCARD command.
tags:
  - discard
  - transactions
  - lifecycle
  - api
related:
  - transactions-multi-and-exec
  - optimistic-locking-with-watch
  - no-rollback-in-redis-transactions
---
> **In one line:** `DISCARD` cancels an active `MULTI` transaction, flushes the queued commands, and resets the connection.

## The idea

During application execution, a program may open a transaction with `MULTI` and begin queuing operations. However, subsequent business logic (such as client validation, external API timeouts, or business rule evaluations) may determine that the transaction should not proceed.

The `DISCARD` command cancels the current transaction block. It flushes all queued commands from server memory, exits transaction mode, and restores the connection to standard interactive command processing.

| Connection State | Command Issued | Resulting State |
|---|---|---|
| Standard Connection | `MULTI` | Enters transaction queuing mode |
| Transaction Queuing Mode | `DISCARD` | **Flushes queue; returns to Standard Connection** |
| Transaction Queuing Mode | `EXEC` | Executes all queued commands; returns to Standard Connection |
| Watching Keys (`WATCH`) | `DISCARD` | Flushes queue, **releases all watched keys** |

> **Tip:** `DISCARD` is safe to call whenever client-side validation fails after `MULTI` has already been opened.

## See it

Canceling a queued transaction and releasing monitored keys:

```bash
# Set initial state
SET transfer:status "pending"

# Begin transaction and queue operations
MULTI
# Returns: OK

SET transfer:status "completed"
# Returns: QUEUED

INCR transfer:count
# Returns: QUEUED

# Business validation fails in application logic! Abort transaction:
DISCARD
# Returns: OK

# Verify that none of the queued commands were executed:
GET transfer:status
# Returns: "pending" (Original value untouched!)

EXISTS transfer:count
# Returns: (integer) 0 (Key was never created!)
```

Calling `DISCARD` ensured that neither the status update nor the counter increment took effect.

## Go deeper

`DISCARD` executes in $O(1)$ constant time. Internally, Redis simply frees the client's temporary command queue array and clears the `CLIENT_MULTI` flag from the connection socket structure.

If the connection had active watched keys registered via `WATCH`, calling `DISCARD` automatically releases all watched keys on that connection, making an explicit call to `UNWATCH` unnecessary. This clean reset behavior ensures connection pool workers can be safely returned to a shared idle pool without lingering transactional side-effects or dirty flags affecting future application threads.

## Watch out

- Calling `DISCARD` when the connection is not inside a `MULTI` block returns an `-ERR DISCARD without MULTI` error.
- Commands that execute outside a transaction cannot be undone by calling `DISCARD`.

## Remember

- `DISCARD` flushes queued commands and exits transaction mode in $O(1)$ time.
- Guarantees that none of the commands queued since `MULTI` will execute.
- Automatically releases all monitored keys attached via `WATCH`.
