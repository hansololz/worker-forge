---
description: Stage all uncommitted changes and create one git commit with a concise message
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git commit:*), Bash(git log:*)
---
Create a single git commit containing ALL uncommitted changes in the working tree:

1. Inspect what changed: `git status --short`, then `git diff` / `git diff --staged`.
2. Stage everything: `git add -A`.
3. Write a **concise** commit message — one imperative-mood subject line (≤72 chars) that
   summarizes the change. Add a short body only if the change spans unrelated areas.
   **IMPORTANT** never add `Co-Authored-By: Claude` message.
4. Show the result: `git log -1 --stat`.

Do not push. Commit on the current branch.
