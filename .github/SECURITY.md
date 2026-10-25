# Security reporting

Report a suspected vulnerability through a private channel before sharing
technical details in an issue or pull request.

## Where to report

If the repository's **Security → Advisories** page offers **Report a
vulnerability**, use that private form. GitHub offers this feature for
public repositories when the owner enables it. This repository is currently
private; do not assume that reporting form is available here.

Use an established private contact for the owner named in
[CODEOWNERS](CODEOWNERS). If none has been provided, ask the owner for a
private channel. An issue containing only “Please provide a private contact
for a security report” is enough; leave vulnerability details out of it.

<!-- Copies: configure a real reporting contact before treating setup as complete.
     Next: docs/runbooks/template-adoption.md covers that owner decision. -->
When copying this template, replace these instructions with the reporting
route your maintainers actually monitor. See GitHub's
[private reporting guidance](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)
for the optional built-in route.

## What to send privately

- The affected repository, commit or version, and relevant environment.
- The expected behavior, observed behavior, and likely impact.
- The smallest reproduction and any relevant, redacted evidence.

Do not include credentials or unrelated private information. No supported
release range or response-time commitment has been established yet; include
the exact commit or version so the maintainer can assess the report.
