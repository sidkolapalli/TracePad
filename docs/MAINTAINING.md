# Contributions and main-branch controls

Community contributors work in forks and open pull requests. They do not need write access to `sidkolapalli/TracePad`. The repository owner, `@sidkolapalli`, reviews and merges changes. Contributing code does not grant merge permission.

## Verify live enforcement

The authoritative state is the repository's [live GitHub rules](https://github.com/sidkolapalli/TracePad/rules), not the presence of JSON files in a checkout. Both rulesets below must be **Active** and apply to `main`. Keep community contributors off the collaborator list; they can use forks and pull requests.

**Committing `.github/rulesets/` or `CODEOWNERS` does not activate protection.** The release record links to the verified live settings. Recheck the rules after changes to repository ownership, access, or CI; do not grant collaborator writes before enforcement is verified.

GitHub supports these rulesets for public repositories on Free and private repositories on Pro or higher. See [GitHub's ruleset availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets). Fork maintainers must adapt the owner identity and repository-specific settings before importing these templates.

## Branch controls

Two rulesets apply together to `refs/heads/main`:

| Ruleset | Controls | Bypass |
| --- | --- | --- |
| [Main integrity](../.github/rulesets/main-integrity.json) | Every change arrives through a PR. All three OS checks must pass against the latest base. Review conversations must be resolved. Force pushes and branch deletion are blocked. | None, including the owner. |
| [Owner gate](../.github/rulesets/main-owner-gate.json) | Restricts branch updates to the owner; requests one code-owner approval and dismisses stale approvals after new commits. | Only `sidkolapalli` (GitHub user ID `141972922`), only through a PR. |

The owner must approve outside contributions after reviewing the final changes. Even an approved contributor cannot merge: the update restriction reserves that action for the owner. `CODEOWNERS` covers every path, including workflows, ruleset templates, and `CODEOWNERS` itself.

GitHub does not allow authors to approve their own PRs. The owner-only PR bypass permits owner-authored changes without an impossible self-approval requirement. It also allows the owner to merge a reviewed contribution through the update restriction. This exception can bypass the review requirement; the maintainer must not use it to skip reviewing external contributions. It cannot bypass the separate CI, PR, resolved-conversation, force-push, or deletion rules.

Required checks come from the GitHub Actions app (integration ID `15368`):

- `Node 24 / ubuntu-latest`
- `Node 24 / windows-latest`
- `Node 24 / macos-latest`

If CI job names change, update the active rules and these templates together. Fix failing checks before merging; do not weaken the rules to pass a release. Auto-merge stays disabled. Administrators can still edit repository settings, so administrator access remains a separate trust decision.

## Initial activation and verification

The owner needs an authenticated GitHub CLI session with repository administration permission. First land `CODEOWNERS`, inspect existing rules, and confirm the check names still match. If these named rules already exist, update their IDs rather than creating duplicates.

```sh
gh api repos/sidkolapalli/TracePad/rulesets
gh api repos/sidkolapalli/TracePad/commits/main/check-runs
```

From the repository root, create the owner gate first, then the integrity rules. Both requests use GitHub's API version supporting individual-user bypasses:

```sh
gh api --method POST -H "X-GitHub-Api-Version: 2026-03-10" repos/sidkolapalli/TracePad/rulesets --input .github/rulesets/main-owner-gate.json
gh api --method POST -H "X-GitHub-Api-Version: 2026-03-10" repos/sidkolapalli/TracePad/rulesets --input .github/rulesets/main-integrity.json
```

If either request fails, report the partial state and finish activation before allowing collaborator writes. Check the returned IDs in **Settings → Rules → Rulesets** and confirm both are **Active**, target `main`, and have exactly the bypass configuration above. Repository files are not automatically synchronized with GitHub settings.

```sh
gh api repos/sidkolapalli/TracePad/rulesets
gh api repos/sidkolapalli/TracePad/rules/branches/main
gh api repos/sidkolapalli/TracePad/codeowners/errors
```

Verify effective behavior with a harmless PR and the GitHub rules view: a non-owner cannot merge even after approval; missing or failing checks block the owner; a passing owner-authored PR can be merged using the review exception. Do not probe force-push or deletion restrictions destructively on `main`. Record the active rule IDs and verification evidence before marking the release gate complete.

See GitHub's [rule behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [ruleset REST API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset), and [code-owner documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).
