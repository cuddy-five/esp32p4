/*
 * Read human approval decisions from pull request conversation comments.
 *
 * The overseer approves by posting a comment with a line of its own:
 *
 *   /approve merge task=<task_id> plan=<plan_id> sha=<40-hex head commit>
 *   /approve plan task=<task_id> plan=<plan_id>
 *
 * and halts or resumes a task with
 *
 *   /halt [task=<task_id>] [reason]
 *   /resume task=<task_id> [reason]
 *
 * A halt only ever stops work, so it fails safe: it counts when edited, indented,
 * or without a task id. An approval or a resume moves work on, so it must be
 * exact and unedited.
 *
 * GitHub records who posted the comment and when, so the approver and time come
 * from the platform, not from the comment text. That authenticates the account,
 * not the person using it: anything holding the overseer's token can post one.
 */

const LINE = /^\/approve[ \t]+(plan|merge)[ \t]+task=(\S+)[ \t]+plan=(\S+)(?:[ \t]+sha=([0-9a-f]{40}))?[ \t]*$/;
const RESUME = /^\/resume[ \t]+task=(\S+)(?:[ \t]+(\S.*))?$/;
const HALT = /^[ \t]*\/halt\b(.*)$/;
const COMMAND = /^(\/(approve|resume)\b|[ \t]*\/halt\b)/;

/** `task=<id>` first, then free text; both optional. */
function haltArgs(rest) {
  const m = /^[ \t]*(?:task=(\S+))?[ \t]*(.*)$/.exec(rest);
  return { task_id: m[1] ?? null, reason: m[2] || null };
}

/**
 * Turn issue comments (GitHub REST shape) into approval records and halt or
 * resume controls. Comments posted by an app or a bot are ignored with a reason,
 * as are edited or malformed approval and resume lines. Controls carry `edited`;
 * whether the author is an overseer, and whether a control counts, is decided by
 * the gate against policies/approvals.yaml (see sortControls in gates.js).
 * @param {any[]} comments
 * @returns {{ approvals: object[], controls: object[], ignored: string[] }}
 */
export function parseApprovalComments(comments) {
  const approvals = [];
  const controls = [];
  const ignored = [];
  for (const c of comments) {
    const lines = String(c?.body ?? "").split(/\r?\n/).filter((l) => COMMAND.test(l)).map((l) => l.trimEnd());
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
    const edited = c.updated_at !== c.created_at;
    const control = { by: login, at: c.created_at, reference: where, authenticated: true, edited };
    for (const line of lines) {
      const halt = HALT.exec(line);
      if (halt) {
        controls.push({ action: "halt", ...haltArgs(halt[1]), ...control });
        continue;
      }
      if (line.startsWith("/resume")) {
        const m = RESUME.exec(line);
        if (m) controls.push({ action: "resume", task_id: m[1], reason: m[2] ?? null, ...control });
        else ignored.push(`${where}: malformed /resume line; it must be /resume task=<task_id>`);
        continue;
      }
      if (edited) {
        ignored.push(`${where}: approval edited after posting; post a new comment`);
        continue;
      }
      const m = LINE.exec(line);
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
  return { approvals, controls, ignored };
}
