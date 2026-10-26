# Triage labels

| Canonical role | Repository label | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Awaiting intake assessment |
| needs-info | needs-info | More information is required |
| ready-for-agent | ready-for-agent | Specified for agent work, subject to execution gates |
| ready-for-human | ready-for-human | Requires human implementation |
| wontfix | wontfix | Will not be actioned |

Keep existing cp:*, risk:*, role:*, and kind:* labels for control-plane state and classification. Use cp:needs-approval for an approval decision and cp:escalation for an escalation; ready-for-human does not replace either. Labels describe state and never authenticate approval.

This file records the vocabulary. Synchronizing missing GitHub labels is a separate authorized settings operation.
