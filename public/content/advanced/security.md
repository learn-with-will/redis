---
id: lesson-21
slug: security
title: "Security"
level: advanced
order: 21
duration: 22
tags:
  - security
  - acl
  - authentication
  - tls
  - hardening
summary: "Locking down Redis: why it must never face the internet, authentication with requirepass and ACL users, encrypting traffic with TLS, protected mode, and disabling or renaming dangerous commands."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Explain why Redis must **never** be exposed directly to the internet, and what protected mode does.
- Require authentication with **`requirepass`** and, better, granular **ACL** users.
- Encrypt client/server traffic with **TLS**.
- **Rename or disable** dangerous commands and apply least privilege.

# Why It Matters

Redis is fast partly because it does little by default — including, historically, little to stop
strangers from connecting. An unsecured Redis reachable from the internet is one of the most commonly
exploited misconfigurations there is: attackers can read all your data, delete it, or use Redis to
pivot into your network. The good news is that securing Redis is straightforward once you know the
handful of controls. This lesson is the checklist.

# Concept Explanation

### Rule zero: don't expose Redis to the internet

Redis is designed to run in a **trusted network**, reachable only by your application servers — never on
a public IP. The defenses start with the network itself: **bind** Redis to private interfaces, keep it
behind a firewall/security group, and never open port 6379 to the world.

To catch accidents, Redis ships with **protected mode** on by default: if Redis is listening on
non-loopback interfaces **and** no password/ACL is configured, it **refuses** connections from other
hosts. Protected mode is a safety net, not a substitute for real authentication and network controls.

### Authentication: requirepass and ACLs

- **`requirepass`** sets a password for the built-in **`default`** user; clients then send `AUTH
  <password>` (or `AUTH default <password>`) before running commands. This is the simplest option — one
  shared password, full access.
- **ACLs (Access Control Lists)**, added in **Redis 6**, are the modern, granular system. You create
  **named users** with precise permissions: which **commands** they may run, which **keys** they may
  touch, and which **Pub/Sub channels** they may use.

```text
127.0.0.1:6379> ACL SETUSER analyst on >s3cret ~stats:* +@read
OK
127.0.0.1:6379> ACL WHOAMI
"default"
```

That creates an enabled user `analyst` with a password, access limited to keys matching `stats:*`, and
permission for **read** commands only (`+@read` is a command **category**). ACLs let you follow **least
privilege**: an app that only reads gets a read-only user; a cache-writer gets write access to just its
key prefix. `ACL LIST`, `ACL GETUSER`, and `ACL WHOAMI` inspect the setup.

### Encrypting traffic with TLS

By default Redis traffic is unencrypted. Enable **TLS** (configure `tls-port` and provide certificates)
to encrypt client↔server — and, in a cluster, node↔node — communication, so credentials and data aren't
sent in the clear. Use TLS whenever traffic crosses any network you don't fully trust.

### Disabling dangerous commands

Some commands are dangerous in the wrong hands: `FLUSHALL`/`FLUSHDB` (wipe data), `CONFIG` (change
settings), `KEYS` (block the server), `DEBUG`, and others. Two ways to restrict them:

- **`rename-command`** in the config — rename a command to an obscure string (so only those who know it
  can call it) or to an empty string `""` to **disable** it entirely.
- **ACLs** — simply don't grant those commands (e.g. `-@dangerous`, or omit `+config`) to a user.

ACLs are the cleaner, per-user approach; `rename-command` is a blunt global switch.

### Other hardening

- Don't run the Redis process as **root**; use a dedicated low-privilege user.
- Keep Redis **updated** to get security fixes.
- Use strong, unique passwords/keys and rotate them; never commit them to source control.

# Key Terminology

- **Protected mode** — default safeguard that refuses external connections when no auth is set.
- **`requirepass`** — a single password for the `default` user (`AUTH` to authenticate).
- **ACL** — named users with fine-grained command/key/channel permissions (Redis 6+).
- **Command category** — a group like `@read`, `@write`, `@dangerous` used in ACL rules.
- **TLS** — transport encryption for Redis connections.
- **`rename-command`** — rename or (with `""`) disable a command globally.

# Options and Trade-offs

| Control | What it protects | Trade-off |
| ------- | ---------------- | --------- |
| **Network isolation + firewall** | Everything (the front line) | Requires correct infra setup |
| **Protected mode** | Accidental exposure with no auth | Not a real auth mechanism; a safety net |
| **`requirepass`** | Unauthorized access | One shared password, all-or-nothing access |
| **ACL users** | Access, per user/command/key | More setup; the right way for least privilege |
| **TLS** | Eavesdropping on the wire | Slight overhead; cert management |

# Worked Example

Set a password, create a least-privilege ACL user, and disable a dangerous command:

```text
# Require a password for the default user (runtime; also set in redis.conf)
127.0.0.1:6379> CONFIG SET requirepass "a-strong-password"
OK
127.0.0.1:6379> AUTH a-strong-password
OK

# A read-only user scoped to cache:* keys
127.0.0.1:6379> ACL SETUSER cache_reader on >readerpass ~cache:* +@read
OK
127.0.0.1:6379> ACL GETUSER cache_reader
1) "flags"
2) 1) "on"
...

# Disable FLUSHALL globally via config (in redis.conf): rename it to ""
# rename-command FLUSHALL ""
```

Now the `default` user needs a password, `cache_reader` can only run read commands on `cache:*` keys,
and `FLUSHALL` can be neutralized by renaming it to an empty string in the configuration file.

# Real World Analogy

Securing Redis is securing a **building**. Rule zero is **don't put the vault on the public sidewalk**
(no internet exposure) — keep it inside, behind the front desk (private network + firewall).
**Protected mode** is a door that stays locked if you forgot to hire a guard. **`requirepass`** is a
single master key everyone shares; **ACLs** are individual badges that open only certain rooms (least
privilege). **TLS** is a sealed courier tube so nobody reads the documents in transit. And you take the
**dynamite** (`FLUSHALL`, `CONFIG`) off the shelf unless someone truly needs it.

# Examples

## Example 1 — Basic: require authentication

A dev Redis is left open with no password. Setting `requirepass` (and confirming protected mode) means a
stray connection can't read or wipe the data without authenticating first.

**Why this works:** authentication is the minimum bar — without it, network access equals full control.

## Example 2 — Real-world: least-privilege app users

A reporting service only needs to read `metrics:*`. Instead of the master password, it gets an ACL user
`+@read ~metrics:*`. Even if that service is compromised, the attacker can't write, delete, or read
other keys.

**Why this works:** scoping permissions to exactly what a service needs limits the blast radius of a
breach.

## Example 3 — Trade-off / pitfall: Redis on a public IP

A team binds Redis to `0.0.0.0` on a cloud box with an open security group "to make testing easier."
Bots find port 6379 within hours, and because no auth was set, they read and delete everything.

**Why this bites:** an internet-reachable Redis without auth is an open door. Bind to private
interfaces, firewall the port, and require authentication — always.

# Common Mistakes

- **Exposing Redis to the internet.** Keep it on a private network behind a firewall; never public.
- **No authentication.** Set `requirepass` or ACL users; don't rely on protected mode alone.
- **One shared password for everything.** Use **ACL users** with least privilege per service.
- **Plaintext traffic over untrusted networks.** Enable **TLS**.
- **Leaving dangerous commands available to all.** Disable/rename them or withhold via ACLs.

# Best Practices

- **Network first:** bind to private interfaces, firewall port 6379, never expose Redis publicly.
- Require **authentication** everywhere; prefer **ACL users** with **least privilege** over one shared
  password.
- Enable **TLS** for any traffic crossing an untrusted network.
- **Disable or rename** dangerous commands (`FLUSHALL`, `CONFIG`, `KEYS`, `DEBUG`) for users that don't
  need them.
- Run Redis as a **non-root** user, keep it **updated**, and rotate credentials.

# Summary

- Redis must run on a **trusted, private network** — **never exposed to the internet**; **protected
  mode** (default on) refuses external connections when no auth is set, as a safety net.
- Authenticate with **`requirepass`** (one password for the `default` user) or, better, **ACL users**
  (Redis 6+) with fine-grained command/key/channel permissions and **least privilege**.
- Use **TLS** to encrypt traffic on untrusted networks.
- **Rename or disable** dangerous commands (or withhold them via ACLs), don't run as **root**, and stay
  **updated**.

# Flash Cards

Q: What is rule zero of Redis security?
A: Never expose Redis directly to the internet — run it on a trusted private network behind a firewall.

Q: What does protected mode do?
A: If Redis listens on non-loopback interfaces and has no password/ACL configured, it refuses connections from other hosts — a safety net, not real authentication.

Q: How do ACLs improve on requirepass?
A: ACLs define named users with fine-grained permissions (which commands, keys, and channels each may use), enabling least privilege instead of one shared, all-access password.

Q: How can you disable a dangerous command like FLUSHALL?
A: Rename it to an empty string with rename-command FLUSHALL "" in the config, or simply don't grant it to a user via ACLs.

Q: What does TLS protect in Redis?
A: It encrypts client/server (and cluster node) traffic so credentials and data aren't sent in the clear over the network.

Q: Why give a read-only reporting service its own ACL user scoped to metrics:*?
A: Least privilege — if that service is compromised, the attacker can't write, delete, or read keys outside metrics:*, limiting the damage.

# Exercises

### Easy
Set `CONFIG SET requirepass "test-pass"`, then run any command and observe the `NOAUTH` error, then
`AUTH test-pass` and retry. Remove it afterward with `CONFIG SET requirepass ""`.

### Medium
Create an ACL user with `ACL SETUSER reporter on >pw ~report:* +@read`, then inspect it with `ACL
GETUSER reporter`. Explain what this user can and cannot do, and why that's safer than sharing the
default password.

### Challenging
Write a short hardening checklist for deploying Redis to production: network exposure, authentication
(requirepass vs ACLs), TLS, dangerous commands, and process user. For each item, state the risk it
mitigates in one sentence.

# Further Reading

- Redis — *Security*: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/>
- Redis — *ACL*: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/>
- Redis — *TLS*: <https://redis.io/docs/latest/operate/oss_and_stack/management/security/encryption/>
- Redis — *ACL command reference*: <https://redis.io/commands/acl-setuser/>
