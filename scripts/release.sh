#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
RELEASE_WORKFLOW="${RELEASE_WORKFLOW:-Release}"

if [[ "${1:-}" == "--" ]]; then
  shift
fi

VERSION_SPEC="${1:-auto}"

usage() {
  cat <<'EOF'
Usage:
  scripts/release.sh [auto|patch|minor|major|X.Y.Z|vX.Y.Z]

Defaults to "auto":
  - releases the current package.json version if its tag does not exist
  - otherwise bumps the patch version and releases that

Environment:
  RELEASE_BRANCH=main       Branch to push with the release tag
  RELEASE_WORKFLOW=Release  GitHub Actions workflow name to watch
EOF
}

die() {
  echo "release: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

if [[ "$VERSION_SPEC" == "-h" || "$VERSION_SPEC" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -gt 1 ]]; then
  usage >&2
  die "too many arguments"
fi

if [[ ! -f package.json || ! -f .github/workflows/release.yml ]]; then
  die "run this script from the workshop-desktop repository"
fi

if [[ -x /opt/homebrew/bin/node ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  die "Node.js is required"
fi

if command -v gh >/dev/null 2>&1; then
  GH_BIN="$(command -v gh)"
elif [[ -x /opt/homebrew/bin/gh ]]; then
  GH_BIN="/opt/homebrew/bin/gh"
else
  die "GitHub CLI is required to publish and verify the release"
fi

tag_exists() {
  local tag="$1"

  git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1 ||
    git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1
}

compare_versions() {
  CURRENT_VERSION="$1" TARGET_VERSION="$2" "$NODE_BIN" <<'NODE'
const parse = (value) => {
  const match = String(value).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version: ${value}`);
  }
  return match.slice(1).map(Number);
};

const current = parse(process.env.CURRENT_VERSION);
const target = parse(process.env.TARGET_VERSION);

for (let i = 0; i < 3; i += 1) {
  if (target[i] > current[i]) {
    process.stdout.write("gt");
    process.exit(0);
  }
  if (target[i] < current[i]) {
    process.stdout.write("lt");
    process.exit(0);
  }
}

process.stdout.write("eq");
NODE
}

compute_next_version() {
  CURRENT_VERSION="$1" VERSION_SPEC="$2" "$NODE_BIN" <<'NODE'
const parse = (value) => {
  const match = String(value).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version or bump type: ${value}`);
  }
  return match.slice(1).map(Number);
};

const format = ([major, minor, patch]) => `${major}.${minor}.${patch}`;
const current = parse(process.env.CURRENT_VERSION);
const spec = process.env.VERSION_SPEC;

if (spec === "patch") {
  current[2] += 1;
  process.stdout.write(format(current));
} else if (spec === "minor") {
  current[1] += 1;
  current[2] = 0;
  process.stdout.write(format(current));
} else if (spec === "major") {
  current[0] += 1;
  current[1] = 0;
  current[2] = 0;
  process.stdout.write(format(current));
} else {
  process.stdout.write(format(parse(spec)));
}
NODE
}

update_package_version() {
  TARGET_VERSION="$1" "$NODE_BIN" <<'NODE'
const fs = require("node:fs");
const path = "package.json";
const packageJson = JSON.parse(fs.readFileSync(path, "utf8"));
packageJson.version = process.env.TARGET_VERSION;
fs.writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
}

assert_release_assets() {
  RELEASE_JSON="$1" "$NODE_BIN" <<'NODE'
const release = JSON.parse(process.env.RELEASE_JSON);
const assets = release.assets || [];
const names = assets.map((asset) => asset.name);
const required = [
  ["macOS universal zip", (name) => name.endsWith("-universal-mac.zip")],
  ["macOS universal blockmap", (name) => name.endsWith("-universal-mac.zip.blockmap")],
  ["macOS update metadata", (name) => name === "latest-mac.yml"],
  ["Windows executable", (name) => name.endsWith(".exe")],
  ["Windows update metadata", (name) => name === "latest.yml"],
];
const missing = required
  .filter(([, predicate]) => !names.some(predicate))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Release ${release.tagName} is missing expected assets: ${missing.join(", ")}`);
  console.error(`Assets found: ${names.join(", ") || "(none)"}`);
  process.exit(1);
}

console.log(`Published ${release.tagName}: ${release.url}`);
console.log(`Assets (${names.length}):`);
for (const name of names) {
  console.log(`- ${name}`);
}
NODE
}

find_release_run() {
  local tag="$1"
  local commit_sha="$2"
  local runs_json

  runs_json="$("$GH_BIN" run list \
    --workflow "$RELEASE_WORKFLOW" \
    --limit 20 \
    --json databaseId,event,headBranch,headSha,status,conclusion,url 2>/dev/null || true)"

  RUNS_JSON="$runs_json" TAG_NAME="$tag" COMMIT_SHA="$commit_sha" "$NODE_BIN" <<'NODE'
const runs = JSON.parse(process.env.RUNS_JSON || "[]");
const tag = process.env.TAG_NAME;
const commit = process.env.COMMIT_SHA;
const run =
  runs.find((item) => item.event === "push" && item.headBranch === tag) ||
  runs.find((item) => item.event === "push" && item.headSha === commit);

if (run) {
  process.stdout.write(String(run.databaseId));
}
NODE
}

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "$RELEASE_BRANCH" ]]; then
  die "current branch is '$current_branch'; expected '$RELEASE_BRANCH'"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "worktree must be clean before starting a release"
fi

info "Checking GitHub CLI authentication"
"$GH_BIN" auth status -h github.com >/dev/null

info "Fetching $RELEASE_BRANCH and tags"
git fetch origin "$RELEASE_BRANCH" --tags

if ! git rev-parse --verify "origin/$RELEASE_BRANCH" >/dev/null 2>&1; then
  die "origin/$RELEASE_BRANCH was not found"
fi

read -r ahead behind < <(git rev-list --left-right --count "HEAD...origin/$RELEASE_BRANCH")
if [[ "$behind" != "0" ]]; then
  die "local $RELEASE_BRANCH is behind origin/$RELEASE_BRANCH; pull or rebase before releasing"
fi

current_version="$("$NODE_BIN" -p "require('./package.json').version")"
if [[ ! "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  die "package.json version '$current_version' is not a plain X.Y.Z version"
fi

if [[ "$VERSION_SPEC" == "auto" ]]; then
  if tag_exists "v$current_version"; then
    target_version="$(compute_next_version "$current_version" patch)"
  else
    target_version="$current_version"
  fi
else
  target_version="$(compute_next_version "$current_version" "$VERSION_SPEC")"
fi

version_order="$(compare_versions "$current_version" "$target_version")"
if [[ "$version_order" == "lt" ]]; then
  die "target version $target_version is lower than current package version $current_version"
fi

tag="v$target_version"
if tag_exists "$tag"; then
  die "tag $tag already exists locally or on origin"
fi

if [[ "$version_order" == "gt" ]]; then
  info "Bumping package.json from $current_version to $target_version"
  update_package_version "$target_version"
else
  info "Using existing package.json version $target_version"
fi

info "Running pre-commit checks"
bash scripts/pre-commit-check.sh

if [[ "$version_order" == "gt" ]]; then
  while IFS= read -r changed_file; do
    case "$changed_file" in
      package.json|pnpm-lock.yaml)
        ;;
      *)
        die "unexpected tracked change after checks: $changed_file"
        ;;
    esac
  done < <(git diff --name-only)

  git add package.json
  if [[ -f pnpm-lock.yaml && -n "$(git diff --name-only -- pnpm-lock.yaml)" ]]; then
    git add pnpm-lock.yaml
  fi

  info "Committing release version"
  git commit --no-verify -m "Prepare $target_version release"
else
  if [[ -n "$(git status --porcelain)" ]]; then
    git status --short
    die "checks changed the worktree unexpectedly"
  fi
fi

release_commit="$(git rev-parse HEAD)"

info "Creating annotated tag $tag"
git tag -a "$tag" -m "$tag"

info "Pushing $RELEASE_BRANCH and $tag"
git push origin "$RELEASE_BRANCH" "$tag"

info "Waiting for GitHub Actions workflow '$RELEASE_WORKFLOW'"
run_id=""
for _ in {1..60}; do
  run_id="$(find_release_run "$tag" "$release_commit")"
  if [[ -n "$run_id" ]]; then
    break
  fi
  sleep 5
done

if [[ -z "$run_id" ]]; then
  die "could not find a GitHub Actions run for $tag"
fi

"$GH_BIN" run watch "$run_id" --exit-status

info "Verifying GitHub Release assets"
release_json="$("$GH_BIN" release view "$tag" --json tagName,name,url,isDraft,isPrerelease,assets,publishedAt)"
assert_release_assets "$release_json"
