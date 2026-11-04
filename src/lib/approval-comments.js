/*
 * Read human approval decisions from pull request conversation comments.
 *
 * The overseer approves by posting a comment with a line of its own:
 *
 *   /approve merge task=<task_id> plan=<plan_id> sha=<40-hex head commit>
 *   /approve plan task=<task_id> plan=<plan_id>
 *
 * GitHub records who posted the comment and when, so the approver and time come
 * from the platform, not from the comment text. That authenticates the account,
 * not the person using it: anything holding the overseer's token can post one.
 */

const LINE = /^\/approve[ \t]+(plan|merge)[ \t]+task=(\S+)[ \t]+plan=(\S+)(?:[ \t]+sha=([0-9a-f]{40}))?[ \t]*$/;

/**
 * Turn issue comments (GitHub REST shape) into approval records.
 * Comments that are edited, posted by an app or a bot, or malformed are ignored with a reason.
 * @param {any[]} comments
 * @returns {{ approvals: object[], ignored: string[] }}
 */
export function parseApprovalComments(comments) {
  const approvals = [];
  const ignored = [];
  for (const c of comments) {
    const lines = String(c?.body ?? "").split(/\r?\n/).filter((l) => l.startsWith("/approve"));
    if (!lines.length) continue;
    const where = c.html_url ?? `comment ${c.id}`;
    const login = c.user?.login;
    if (c.user?.type !== "User" || !login) {
      ignored.push(`${where}: author ${login ?? "unknown"} is not a user account`);
      continue;
    }
    if (c.performed_via_github_app) {
      ignored.push(`${where}: posted through app ${c.performed_via_github_app.slug ?? "unknown"}`);
      continue;
    }
    // An edit can change the commit or plan after the fact; post a new comment instead.
    if (c.updated_at !== c.created_at) {
      ignored.push(`${where}: edited after posting`);
      continue;
    }
    for (const line of lines) {
      const m = LINE.exec(line.trimEnd());
      if (!m || (m[1] === "merge" && !m[4])) {
        ignored.push(`${where}: malformed approval line`);
        continue;
      }
      approvals.push({
        stage: m[1],
        task_id: m[2],
        plan_id: m[3],
        ...(m[4] ? { sha: m[4] } : {}),
        approver: login,
        granted_at: c.created_at,
        reference: where,
        authenticated: true,
      });
    }
  }
  return { approvals, ignored };
}
