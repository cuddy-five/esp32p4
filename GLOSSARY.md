# Agentic Engineering Control Plane

The control plane coordinates engineering work under the repository owner's authority.

## Language

**Overseer**:
The human owner who grants delegated authority and retains decisions about its expansion, major exceptions, merges, and releases.

**Delegated authority**:
Permission to make specified operational decisions within owner-approved limits. Expansion requires evidence of reliability and explicit owner approval.

**Jev judgment**:
A probabilistic assessment used to select or trigger an action within delegated authority. It does not itself grant permission or waive a required check.

**Mandatory gate**:
A required condition that must be satisfied before work can advance, regardless of a model's judgment.

**Repair round**:
One attempt to resolve review or test findings and repeat the affected checks within the approved task.

**Adjudication**:
An independent assessment of conflicting review findings before unresolved disagreement is escalated to the overseer.

**Agent package**:
Everything an agent needs for its job: its instructions, prompts, skills, tools and the control-plane rules it must follow. These parts can be improved after the agent is created.

**Domain specialization**:
Knowledge an agent has about a particular kind of work. An agent can combine related knowledge, such as Rust and Bitcoin, while keeping writing and independently reviewing the same work separate.

**Agent foundry**:
The tool used to create agents and prepare the instructions, skills and tools they need. Its output can be reviewed and adjusted afterward.
