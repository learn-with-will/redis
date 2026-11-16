---
slug: access-control-lists-acl
title: Access Control Lists (ACL)
topic: security-and-operations
kind: technique
summary: Implement granular role-based security in Redis 6+ with ACL rules, key pattern restrictions, and command categories.
tags:
  - acl
  - security
  - rbac
  - permissions
related:
  - authentication-with-requirepass
  - renaming-and-disabling-dangerous-commands
---
> **In one line:** Redis ACLs enforce role-based access control by restricting individual users to specific commands, key patterns, and channels.

## The idea
Prior to Redis 6, authentication was all-or-nothing: every authenticated client possessed full administrative power, including the ability to run destructive commands like `FLUSHALL` or `CONFIG`.

**Access Control Lists (ACL)** introduce granular, multi-user role-based security. Administrators can define distinct users with restricted privileges:
* Restrict allowed commands (e.g. read-only commands like `+@read`).
* Restrict key namespaces (e.g. `~cached:*`).
* Restrict Pub/Sub channels (e.g. `&events:*`).

| ACL Component | Syntax Prefix | Example |
| :--- | :--- | :--- |
| **Command Whitelist** | `+<command>` or `+@<category>` | `+get +@read -keys` |
| **Key Pattern** | `~<pattern>` | `~cache:*` |
| **Channel Pattern** | `&<pattern>` | `&chat:*` |
| **Password** | `><password>` | `>SecretPass123` |

## See it
Create a read-only analytics user restricted to keys prefixed with `metrics:`:

```bash
# Define user 'analytics' with password, read permissions, and key pattern
127.0.0.1:6379> ACL SETUSER analytics on >Analyt1csPass! resetkeys ~metrics:* -@all +@read
OK

# Authenticate as the newly created user
127.0.0.1:6379> AUTH analytics Analyt1csPass!
OK

# Permitted read operation on allowed key pattern succeeds
127.0.0.1:6379> GET metrics:daily_visits
"42910"

# Writing to the key is blocked by command permissions
127.0.0.1:6379> SET metrics:daily_visits "50000"
(error) NOPERM this user has no permissions to run the 'set' command

# Reading outside the allowed key namespace is blocked
127.0.0.1:6379> GET user:100:profile
(error) NOPERM this user has no permissions to access the 'user:100:profile' key
```

## Go deeper
Inspect configured users and track security audit violations using ACL diagnostics:

```bash
# List all active ACL users and rules
127.0.0.1:6379> ACL LIST
1) "user default on nopass ~* &* +@all"
2) "user analytics on #hash... ~metrics:* -@all +@read"

# Inspect security log for rejected unauthorized attempts
127.0.0.1:6379> ACL LOG 2
1) 1) (integer) 1
   2) (integer) 1620003000
   3) "auth"
   4) "metrics:daily_visits"
   5) "analytics"
   6) "127.0.0.1:51420"
```

ACL command categories make permission assignment intuitive. Common categories include `@read`, `@write`, `@admin`, `@dangerous`, `@fast`, and `@slow`. For example, granting `+@read +@fast -@dangerous` gives a microservice fast data lookup abilities without risking blocking queries or administrative commands.

> **Tip:** In production, disable or set a strong password on the `default` user (`ACL SETUSER default off` or `ACL SETUSER default >StrongPass`).

## Watch out
* If using an external ACL file (`aclfile /etc/redis/users.acl`), use `ACL SAVE` to persist dynamic changes to disk.
* Do not mix `requirepass` and ACL files in the same configuration, as it can create authentication ambiguity.

## Remember
* Redis ACL enables multi-user role-based permissions for microservices and teams.
* Rules restrict operations by command category (`+@read`), key pattern (`~prefix:*`), and Pub/Sub channel (`&pattern`).
* Inspect unauthorized permission breaches in real time using `ACL LOG`.
