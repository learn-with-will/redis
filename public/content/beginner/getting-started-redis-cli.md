---
id: lesson-02
slug: getting-started-redis-cli
title: "Getting Started with redis-cli"
level: beginner
order: 2
duration: 20
tags:
  - redis-cli
  - installation
  - resp
  - databases
  - tooling
summary: "Install Redis (including with Docker), connect with redis-cli, and learn the essential session commands — PING, INFO, SELECT and the 16 logical databases, DBSIZE, CONFIG — plus a first look at the RESP request/response protocol."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Get a Redis server running locally, including with **Docker**.
- Connect to it with **`redis-cli`**, choosing host, port, and database.
- Use the core session commands: `PING`, `INFO`, `SELECT`, `DBSIZE`, `CONFIG`.
- Explain what the **16 logical databases** are and when (not) to use them.
- Describe, at a high level, the **RESP** protocol that carries commands and replies.

# Why It Matters

You can read about Redis all day, but it clicks the moment you type a command and see the
reply. `redis-cli` is the interactive shell you'll live in while learning — and a genuinely
useful tool in production for inspecting a live server. Getting comfortable here makes every
later lesson hands-on.

# Concept Explanation

### Getting a server running

Redis is a server program, `redis-server`, that listens for client connections (by default on
TCP port **6379**). You have a few ways to get one:

- **Package manager** — e.g. `apt install redis` on Debian/Ubuntu or `brew install redis` on
  macOS, then start it with `redis-server`.
- **Docker** — no local install needed:

```bash
docker run --name my-redis -p 6379:6379 -d redis
```

  This runs the official `redis` image and maps container port 6379 to your machine.

- **Redis Cloud / a managed service** — a hosted instance you connect to over the network.

> On Windows, the recommended path is Docker or **WSL** (the Windows Subsystem for Linux);
> Redis targets Linux/Unix.

### Connecting with redis-cli

`redis-cli` is the command-line client. Run it with no arguments to connect to
`127.0.0.1:6379`:

```bash
redis-cli
```

To connect elsewhere, pass options: `-h <host>`, `-p <port>`, `-n <db-number>`, and `-a
<password>` (or better, `REDISCLI_AUTH`, so the password isn't in your shell history). Once
connected you get a prompt showing the host, port, and current database:

```text
127.0.0.1:6379>
```

Type `PING` and Redis replies `PONG` — your "hello world" that the connection works.

### The 16 logical databases

A single Redis server exposes **numbered logical databases**, by default **16** of them
(numbers **0–15**). You switch with `SELECT`:

```text
127.0.0.1:6379> SELECT 1
OK
127.0.0.1:6379[1]> DBSIZE
(integer) 0
```

Each database is a separate keyspace, but they all share the same server, memory, and
configuration — so they are **not** a way to isolate tenants or scale. In fact multiple
databases are discouraged in modern usage and are **not supported in Redis Cluster**. Most
production setups use database 0 only and separate concerns with **key prefixes** or separate
Redis instances. It's fine to use a couple of databases locally to keep experiments tidy.

### Looking around: INFO, DBSIZE, and clearing data

- `INFO` prints a big report grouped into sections (server, clients, memory, persistence,
  stats, replication, keyspace, …). `INFO memory` prints just one section.
- `DBSIZE` returns how many keys are in the current database.
- `FLUSHDB` deletes **every key in the current database**; `FLUSHALL` deletes **every key in
  every database**. Both are immediate and irreversible — never run them casually on anything
  that matters.

Configuration can be read and changed at runtime with `CONFIG GET` and `CONFIG SET`:

```text
127.0.0.1:6379> CONFIG GET maxmemory
1) "maxmemory"
2) "0"
```

### RESP: how commands travel

Clients and the server speak **RESP** (the **RE**dis **S**erialization **P**rotocol). You
don't have to hand-write it — `redis-cli` and every client library do it for you — but a
mental model helps.

A command is sent as an **array of arguments**. The reply comes back tagged by type: a
**simple string** (like `OK`), an **error**, an **integer**, a **bulk string** (a binary-safe
value), or an **array** of replies. That's why `redis-cli` shows `OK`, `(integer) 2`,
`(nil)`, `"a string"`, or a numbered `1) ... 2) ...` list — it's rendering those RESP reply
types. RESP2 is the classic protocol; **RESP3** (opt-in with the `HELLO 3` command) adds
richer types like maps. One more nicety: **command names are case-insensitive** (`set`,
`SET`, and `SeT` all work), though **keys are case-sensitive**.

# Key Terminology

- **`redis-server`** — the Redis server process that holds data and answers commands.
- **`redis-cli`** — the interactive command-line client for talking to a server.
- **Port 6379** — the default TCP port Redis listens on.
- **Logical database** — one of the numbered keyspaces (0–15 by default) within a single
  server, switched with `SELECT`.
- **RESP** — the Redis wire protocol; requests are argument arrays, replies are typed.
- **`INFO`** — a command returning server status and statistics, grouped into sections.

# Options and Trade-offs

Ways to run Redis while learning:

| Option | Setup effort | Good for | Watch out for |
| ------ | ------------ | -------- | ------------- |
| **Docker** | One command, no install | Quick, disposable local instance | Data lives in the container unless you mount a volume |
| **Native install** | Package manager | A persistent local dev server | OS-specific; on Windows use WSL/Docker |
| **Managed / Redis Cloud** | Sign-up, no ops | Trying features without running a server | Network latency; a remote endpoint to secure |

# Worked Example

Connect, check the connection, inspect the keyspace, and switch databases:

```text
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET city "Oslo"
OK
127.0.0.1:6379> DBSIZE
(integer) 1
127.0.0.1:6379> INFO keyspace
# Keyspace
db0:keys=1,expires=0,avg_ttl=0
127.0.0.1:6379> SELECT 2
OK
127.0.0.1:6379[2]> DBSIZE
(integer) 0
127.0.0.1:6379[2]> SELECT 0
OK
```

Notice the prompt shows `[2]` while you're in database 2, and the `INFO keyspace` section
reports one key in `db0`.

# Real World Analogy

A Redis server is like an apartment building with 16 identical mailrooms (databases 0–15).
`redis-cli` is your key to the front door; `SELECT` walks you into a particular mailroom;
`PING` is knocking to check someone's home. The mailrooms share the building's power and
water (memory and config), so splitting your mail across them doesn't give you a second
building — for that you rent another building (another Redis instance).

# Examples

## Example 1 — Basic: a one-off command without the shell

You can run a single command straight from your terminal without entering the interactive
prompt:

```bash
redis-cli PING
redis-cli SET deploy:version "1.4.2"
```

**Why this works:** `redis-cli` accepts a command as arguments, sends it, prints the reply,
and exits — handy for scripts and quick checks.

## Example 2 — Real-world: inspecting a live server

On a running system, `redis-cli INFO memory` shows how much memory Redis is using, and
`redis-cli DBSIZE` shows how many keys it holds. These read-only commands are safe ways to
understand a server's state during an incident.

**Why this works:** `INFO` exposes the server's own metrics, so you diagnose from facts rather
than guesses.

## Example 3 — Trade-off / pitfall: using databases as "tenants"

A team stores customer A in database 1 and customer B in database 2, thinking they're
isolated. But both share memory and config, `FLUSHALL` wipes both, and moving to Cluster later
breaks entirely (Cluster has no multiple databases).

**Why this bites:** logical databases are a lightweight namespacing convenience on one server,
not an isolation or scaling boundary. Use separate instances or key prefixes instead.

# Common Mistakes

- **Leaving Redis reachable from the internet.** A default dev server may be open; never expose
  6379 publicly (there's a whole security lesson later).
- **Running `FLUSHALL`/`FLUSHDB` on the wrong server.** They're instant and irreversible — check
  which host and database you're on first (the prompt shows it).
- **Treating databases 0–15 as isolation or scaling.** They share everything and don't exist in
  Cluster.
- **Putting `-a password` on the command line.** It can leak via shell history and process
  lists; prefer the `REDISCLI_AUTH` environment variable.

# Best Practices

- Use **Docker** for a clean, disposable learning instance; mount a volume if you want data to
  survive.
- Learn `INFO` early — it's your window into memory, persistence, clients, and stats.
- Stick to **database 0** and namespace with key prefixes unless you have a specific local
  reason not to.
- Keep a `redis-cli` open beside you as you work through the course and *type every example*.

# Summary

- `redis-server` holds the data; `redis-cli` is the client. The default endpoint is
  `127.0.0.1:6379`.
- Get a server fast with `docker run -p 6379:6379 -d redis`.
- `PING`→`PONG` checks the connection; `INFO` reports status; `DBSIZE` counts keys; `CONFIG
  GET/SET` reads/changes settings at runtime.
- A server has **16 logical databases** (0–15) switched by `SELECT`; they share resources, are
  discouraged for isolation, and don't exist in Cluster.
- Clients speak **RESP**: requests are argument arrays; replies are typed (simple string,
  error, integer, bulk string, array). Command names are case-insensitive; keys are not.

# Flash Cards

Q: What is the default TCP port for Redis?
A: 6379.

Q: What does PING return when the connection is healthy?
A: PONG.

Q: How many logical databases does a Redis server have by default, and how do you switch?
A: 16 (numbered 0–15), switched with the SELECT command.

Q: Why shouldn't you use logical databases to isolate tenants?
A: They share the same server, memory, and config, aren't an isolation/scaling boundary, and don't exist in Redis Cluster.

Q: What's the difference between FLUSHDB and FLUSHALL?
A: FLUSHDB clears the current database; FLUSHALL clears every database — both immediate and irreversible.

Q: What does RESP stand for and what does it carry?
A: The REdis Serialization Protocol — it carries commands (as argument arrays) and typed replies between client and server.

# Exercises

### Easy
Start Redis with Docker, run `redis-cli PING`, and confirm you get `PONG`. Then run
`redis-cli INFO server` and find the `redis_version` line.

### Medium
In `redis-cli`, set a key in database 0, use `SELECT 3` and confirm with `DBSIZE` that
database 3 doesn't see it, then `SELECT 0` again and `GET` your key back. Explain what this
tells you about how databases relate.

### Challenging
Run `CONFIG GET maxmemory` and `CONFIG GET save`. Look up what each controls (you'll meet both
later — memory limits and RDB snapshotting). Write one sentence predicting what a non-zero
`maxmemory` would change about how Redis behaves when it fills up.

# Further Reading

- Redis — *Install Redis*: <https://redis.io/docs/latest/operate/oss_and_stack/install/>
- Redis — *redis-cli, the Redis command line interface*: <https://redis.io/docs/latest/develop/tools/cli/>
- Redis — *RESP protocol spec*: <https://redis.io/docs/latest/develop/reference/protocol-spec/>
- Redis — *SELECT* and *INFO* command pages: <https://redis.io/commands/select/> · <https://redis.io/commands/info/>
