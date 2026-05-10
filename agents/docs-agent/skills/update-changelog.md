---
skill: update-changelog
version: 1.0
agent: docs-agent
---

# Skill: Update Changelog

## When to invoke
A session has completed and the output needs to be recorded in the project changelog.

## Steps
1. Read session manifest and completed stories
2. Categorize changes: Added / Changed / Fixed / Deprecated / Removed
3. Write a concise entry for each completed story (one line each)
4. Use present tense: "Add login endpoint" not "Added login endpoint"
5. Prepend the new entry — most recent change at top

## Output format
// filepath: docs/CHANGELOG.md
Format: ## [Unreleased] - {date}\n### Added\n- ...
