/**
 * Push local file changes to main via GitHub GraphQL createCommitOnBranch.
 * Used when git://github.com HTTPS is unreachable but api.github.com works.
 *
 * Usage: node scripts/gh-push-commit.mjs "commit message" file1 file2 ...
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const [message, ...files] = process.argv.slice(2);
if (!message || files.length === 0) {
  console.error('Usage: node scripts/gh-push-commit.mjs "msg" file1 [file2...]');
  process.exit(1);
}

function gh(args, inputPath) {
  return execFileSync(
    "gh",
    inputPath ? ["api", ...args, "--input", inputPath] : ["api", ...args],
    { encoding: "utf8" }
  ).trim();
}

const headOid = gh([
  "repos/bistuwangqiyuan/tokshop/git/ref/heads/main",
  "--jq",
  ".object.sha",
]);

const additions = files.map((path) => ({
  path: path.replace(/\\/g, "/"),
  contents: readFileSync(path).toString("base64"),
}));

const payload = {
  query: `mutation($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit { oid url }
    }
  }`,
  variables: {
    input: {
      branch: {
        repositoryNameWithOwner: "bistuwangqiyuan/tokshop",
        branchName: "main",
      },
      message: { headline: message },
      expectedHeadOid: headOid,
      fileChanges: { additions },
    },
  },
};

const tmp = ".gh-commit-payload.json";
writeFileSync(tmp, JSON.stringify(payload));
try {
  const result = JSON.parse(gh(["graphql"], tmp));
  if (result.errors) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result.data.createCommitOnBranch.commit, null, 2));
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}
