---
slug: authentication-with-requirepass
title: Authentication with requirepass and AUTH
topic: security-and-operations
kind: technique
summary: Configure primary passwords with requirepass, authenticate using the AUTH command, and generate cryptographically strong secrets.
tags:
  - requirepass
  - auth
  - security
  - passwords
related:
  - network-binding-and-protected-mode
  - access-control-lists-acl
---
> **In one line:** The requirepass directive secures Redis with a master password that clients must provide using AUTH before issuing commands.

## The idea
Redis authentication began with the `requirepass` configuration directive. When set, clients entering a connection can perform no actions until they authenticate with the `AUTH` command.

Because Redis is capable of validating hundreds of thousands of passwords per second, short or simple passwords can be brute-forced within seconds. A production Redis password must be a long, cryptographically random string (at least 32 characters).

```text
Client Connection Established
   |
   +--> GET user:100 ---> (error) NOAUTH Authentication required.
   |
   +--> AUTH "SecretRandomString4920!" ---> +OK
   |
   +--> GET user:100 ---> "Alice"
```

## See it
Set and test `requirepass` dynamically and in configuration files:

```bash
# Generate a cryptographically secure 40-character password
$ openssl rand -hex 20
e2b83a0e37e9d7a22839b83f063d81b4d3f5e1a9

# Set password at runtime via redis-cli
127.0.0.1:6379> CONFIG SET requirepass "e2b83a0e37e9d7a22839b83f063d81b4d3f5e1a9"
OK

# Unauthenticated commands are blocked immediately
127.0.0.1:6379> SET status "online"
(error) NOAUTH Authentication required.

# Authenticate the connection
127.0.0.1:6379> AUTH e2b83a0e37e9d7a22839b83f063d81b4d3f5e1a9
OK

# Subsequent commands execute normally
127.0.0.1:6379> SET status "online"
OK
```

## Go deeper
When setting `requirepass` in `redis.conf`, persist the directive directly to disk:

```text
# redis.conf
requirepass "e2b83a0e37e9d7a22839b83f063d81b4d3f5e1a9"

# If this instance is also a replica, provide master credentials
masterauth "e2b83a0e37e9d7a22839b83f063d81b4d3f5e1a9"
```

When replicas connect to a password-protected primary, they must specify `masterauth` with the exact same secret, otherwise synchronization handshakes will fail with `NOAUTH`. Under the hood, setting `requirepass` configures the password for the built-in `default` user. Clients can authenticate using either `AUTH <password>` or `AUTH default <password>`.

> **Tip:** You can connect directly with credentials from the terminal using `redis-cli -a <password>` or via Redis URI `redis://:password@host:6379`.

## Watch out
* Passing `-a <password>` in bash command lines exposes secrets in shell history and `ps aux` output.
* While `requirepass` is simple, it provides all-or-nothing access; use Access Control Lists (ACL) for granular user roles.

## Remember
* `requirepass` blocks all unauthenticated client requests until `AUTH` is verified.
* Always generate long, random passwords (32+ characters) to defeat fast offline brute-force attacks.
* Configure `masterauth` on replica instances to allow replication handshakes with protected primaries.
