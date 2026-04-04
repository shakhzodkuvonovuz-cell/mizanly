# Branch Protection Rules

Apply these settings to the `main` branch via GitHub Settings > Branches > Branch protection rules.

## Required Settings

| Setting | Value | Why |
|---------|-------|-----|
| **Require pull request reviews** | 1 approval minimum | Prevents unreviewed code from landing on main |
| **Require status checks to pass** | All CI jobs | Broken code never merges |
| **Required status checks** | `lint-and-typecheck`, `test-api`, `test-api-integration`, `test-mobile-signal`, `build-api`, `e2e-server`, `livekit-server`, `security` | Matches ci.yml job names |
| **Require branches to be up to date** | Enabled | Merge conflicts caught before merge, not after |
| **Do not allow force pushes** | Enabled | Protects commit history on main |
| **Do not allow deletions** | Enabled | Prevents accidental branch deletion |
| **Require linear history** | Optional (recommended) | Cleaner git log, easier bisect |

## How to Apply

```bash
# Via GitHub CLI (requires admin access):
gh api repos/{owner}/mizanly/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["lint-and-typecheck","test-api","test-api-integration","test-mobile-signal","build-api","e2e-server","livekit-server","security"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

Or configure manually in GitHub repository Settings > Branches > Add branch protection rule > Branch name pattern: `main`.
