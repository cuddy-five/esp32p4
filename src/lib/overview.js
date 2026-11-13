/*
 * One read-only report of what waits on the overseer in a repository.
 *
 * It answers three questions from GitHub alone: which pull requests are open,
 * which branches hold work that is not in the default branch and has no pull
 * request, and which issues are open. The second question is the one nothing
 * else answers: finished work on a branch with no pull request is invisible in
 * the pull request list, runs no checks, and waits on nobody.
 *
 * It reads; it changes nothing. Titles, branch names and commit subjects are
 * text written by others, so the text formatter escapes them.
 */
import { printable } from "./report.js";

/** Encode a ref for a URL path, keeping the slashes between its parts. */
const refPath = (ref) => ref.split("/").map(encodeURIComponent).join("/");
const day = (timestamp) => (typeof timestamp === "string" ? timestamp.slice(0, 10) : "unknown date");
const firstLine = (message) => String(message ?? "").split("\n")[0];

/**
 * @param {{ client: import("./github.js").GitHubClient, repo: { owner: string, name: string } }} opts
 * @returns {Promise<{
 *   repository: string, default_branch: string,
 *   pull_requests: object[], unmerged_branches: object[], merged_branches: string[], issues: object[],
 * }>}
 */
export async function buildOverview({ client, repo }) {
  const fullName = `${repo.owner}/${repo.name}`;
  const base = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  const { data: info } = await client.request("GET", base);
  const main = info?.default_branch;
  if (typeof main !== "string" || !main) throw new Error(`GitHub reported no default branch for ${fullName}`);

  const pulls = await client.paginate(`${base}/pulls`, { params: { state: "open" } });
  const pullRequests = pulls.map((p) => ({
    number: p.number,
    title: p.title,
    branch: p.head?.ref ?? null,
    from_fork: p.head?.repo?.full_name !== fullName,
    draft: p.draft === true,
    updated_at: p.updated_at ?? null,
    url: p.html_url ?? null,
  }));
  const hasPullRequest = new Set(pullRequests.filter((p) => !p.from_fork).map((p) => p.branch));

  const unmerged = [];
  const merged = [];
  for (const branch of await client.paginate(`${base}/branches`)) {
    if (branch.name === main || hasPullRequest.has(branch.name)) continue;
    const { data: cmp } = await client.request("GET", `${base}/compare/${refPath(main)}...${refPath(branch.name)}`);
    if (!(cmp?.ahead_by > 0)) {
      merged.push(branch.name);
      continue;
    }
    // The comparison lists at most 250 commits, oldest first; use the last only when it is the branch tip.
    const tip = cmp.commits?.at(-1);
    const newest = tip && tip.sha === branch.commit?.sha
      ? { sha: tip.sha, date: tip.commit?.committer?.date ?? tip.commit?.author?.date ?? null, subject: firstLine(tip.commit?.message) }
      : { sha: branch.commit?.sha ?? null, date: null, subject: null };
    unmerged.push({ branch: branch.name, ahead: cmp.ahead_by, behind: cmp.behind_by ?? 0, newest });
  }
  unmerged.sort((a, b) => String(b.newest.date ?? "").localeCompare(String(a.newest.date ?? "")) || a.branch.localeCompare(b.branch));

  // The issues endpoint also returns pull requests; those are listed above.
  const issues = (await client.paginate(`${base}/issues`, { params: { state: "open" } }))
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      labels: (i.labels ?? []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean),
      updated_at: i.updated_at ?? null,
      url: i.html_url ?? null,
    }));

  return {
    repository: fullName,
    default_branch: main,
    pull_requests: pullRequests,
    unmerged_branches: unmerged,
    merged_branches: merged.sort(),
    issues,
  };
}

/** Plain-text overview, most urgent first. @param {Awaited<ReturnType<typeof buildOverview>>} report */
export function formatOverview(report) {
  const main = printable(report.default_branch);
  const out = [`Overview of ${printable(report.repository)} (default branch ${main})`, ""];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (report.unmerged_branches.length) {
    const n = report.unmerged_branches.length;
    out.push(`Work that is not in ${main} and has no pull request (${n} branch${n === 1 ? "" : "es"}):`);
    for (const b of report.unmerged_branches) {
      const newest = b.newest.subject === null ? "" : `; newest ${day(b.newest.date)}: ${printable(b.newest.subject)}`;
      out.push(`  ${printable(b.branch)}  ${plural(b.ahead, "commit")} ahead, ${b.behind} behind${newest}`);
    }
    out.push("  No check runs on this work and nobody is asked to review it. Open a pull request for it, or delete the branch.", "");
  } else {
    out.push(`Work that is not in ${main} and has no pull request: none`, "");
  }

  if (report.pull_requests.length) {
    out.push(`Open pull requests (${report.pull_requests.length}):`);
    for (const p of report.pull_requests) {
      const notes = [p.draft ? "draft" : null, p.from_fork ? "from a fork" : null].filter(Boolean).join(", ");
      out.push(`  #${p.number} ${printable(p.title)}${notes ? ` [${notes}]` : ""}  branch ${printable(p.branch)}, updated ${day(p.updated_at)}`);
    }
    out.push("");
  } else {
    out.push("Open pull requests: none", "");
  }

  if (report.issues.length) {
    out.push(`Open issues (${report.issues.length}):`);
    for (const i of report.issues) out.push(`  #${i.number} ${printable(i.title)}${i.labels.length ? ` [${i.labels.map(printable).join(", ")}]` : ""}`);
    out.push("");
  } else {
    out.push("Open issues: none", "");
  }

  if (report.merged_branches.length) {
    out.push(`Branches whose work is already in ${main} (${report.merged_branches.length}): ${report.merged_branches.map(printable).join(", ")}`);
    out.push("  Deleting these loses nothing.", "");
  }
  out.push("This report reads GitHub only. It does not show local branches, uncommitted work, or agents and jobs that are running.");
  return out.join("\n");
}
