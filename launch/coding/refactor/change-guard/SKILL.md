---
name: change-guard
description: Guard structural, refactoring, dependency, contract, and configuration changes by capturing the baseline, adding a consistency test, making the change deliberately, and verifying that no stale references or docs remain.
---

# Change Guard

Version: 0.1.0
Status: launch
Reviewed: 2026-05-16
Reviewer: bas

## Purpose

Prevent structural and refactoring changes from leaving the project in an inconsistent state. Every change that alters contracts, dependencies, references, or configuration must be captured before, changed deliberately, and verified after.

## When to Use

Apply this skill when the task involves any of:

- Removing, replacing, or relocating a module, service, or dependency
- Changing a contract: API shape, config schema, env var names, file paths
- Updating how a component is referenced (submodule -> image, local -> remote, hardcode -> env var)
- Refactoring shared code that other files or services depend on
- Changing Docker, network, or security configuration

Do not apply for trivial edits that affect a single file with no dependents.

## Procedure

### 1. Capture Baseline

Before making any change, capture what is currently true and working.

- List every file that references the thing being changed. Use `rg` to find all references across the repo.
- For each reference, note: what it says now, where it lives, and whether it is code, config, documentation, or test.
- If the change affects runtime behavior, run existing tests and record the result as the baseline.

Output: a short inventory of references and a baseline test result.

### 2. Write Guard Test

Write a test that encodes the expected state after the change. The test should fail now (red) and pass after the change is complete (green).

The test should verify at minimum:

- No stale references remain (old names, old paths, old descriptions).
- No hardcoded values that should have been parameterized.
- New references are consistent (same name, same description, same pattern across all files).
- Documentation matches code.

This test lives in the project's test directory and is committed alongside the change.

### 3. Make the Change

Apply the change across all files identified in the inventory. For each file:

- Update the reference, config value, or code.
- Remove orphans: if the change makes an import, variable, or path unused, remove it.
- Do not touch unrelated code.

### 4. Verify

- Run the guard test. It must pass (green).
- Run the full project test suite. It must not regress.
- Run `rg` again for the old reference pattern. It must return zero matches.
- Check documentation: read the changed sections and confirm they describe the new state, not the old one.

### 5. Commit

Commit the guard test and the change together. The commit message should state what was captured, what changed, and how verification was done.

## Incident Reference

This skill was written after removing the nomad-service git submodule from openclaw-runtime. The submodule was removed from git, but multiple files still referenced it as "submodule", docker-compose.yml still had hardcoded personal paths and default passwords, and openclaw-runtime.sh still contained the same hardcoded secrets. No test existed to catch these inconsistencies. The fix required writing a repo-consistency test after the fact (violating TDD) and patching references one by one.

## Recommended Use Cases

- **Removing a dependency** (submodule, package, service) - ensures all references are cleaned up
- **Renaming or relocating** a module, endpoint, or config key - ensures no broken references
- **Parameterizing hardcoded values** (paths, secrets, ports) - ensures nothing was missed
- **Changing a service from build to image** or vice versa - ensures docker-compose, scripts, and docs agree
- **Contract changes** (API shape, env var names, file paths) - ensures consumers are updated
- **Any change where multiple files must stay consistent** - the guard test encodes that consistency
