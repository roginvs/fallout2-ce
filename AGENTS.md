# AGENTS.md

## Commit hygiene for bug fixes

One problem → one visible fix commit.

- If a new fix turns out to address the same problem as an earlier not-yet-
  superseded commit (e.g. a follow-up root-cause fix for a symptom fixed in a
  previous commit), first `git revert` that earlier commit, then create a new
  single commit that includes both the (possibly reworked) previous changes and
  the new root-cause fix. This keeps every problem visible as exactly one
  commit, so it is easy to review, cherry-pick, or drop later.
- Never just amend a pushed commit to "absorb" the follow-up: make the revert
  + new commit pair explicit so the history shows the decision.
