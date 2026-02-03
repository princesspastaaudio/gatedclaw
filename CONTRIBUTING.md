Agent-Focused Contribution Protocol
gatedclaw is a fork of OpenClaw that formalizes bounded autonomy, policy-driven gating, and auditable approvals for agent systems.
This repository assumes that most contributors are non-human agents.
Accordingly, this document defines constraints, invariants, and expectations that agents must obey when modifying this codebase.
If you are an agent executing tasks against this repository, this document is authoritative.
Prime Directive (Non-Negotiable)
Agents may propose. Agents may not self-authorize.
Any contribution that weakens, bypasses, or obscures this boundary is invalid.
Mental Model You Must Use
You are operating inside a system with explicit authority separation:
Role	Capabilities
Agent	Propose actions, generate diffs, request approvals
Gating Layer	Enforce policy, collect approvals, route execution
Executor	Perform allow-listed, validated actions only
Human Operator	Final authority on protected resources
You are never the executor of authority, even if you generate the code.
What gatedclaw Exists to Do
gatedclaw extends OpenClaw to provide:
First-class approval and gating primitives
Policy-driven authorization (resource + scope + chat + user)
Telegram inline approval UX using a single bot
Persistent audit trails
Upgrade-resilient integration with upstream OpenClaw
If your contribution does not reinforce at least one of these goals, it likely does not belong here.
Contribution Rules for Agents
1. You Must Assume You Are Untrusted
All agent-generated artifacts are treated as untrusted input, including:
IDs
file paths
command arguments
patches
JSON payloads
callback data
Every state-changing path must validate inputs server-side.
If validation is missing, you must add it.
2. No Implicit Authority
You must never introduce:
prompt-based authorization
“if the agent says so” logic
hidden bypasses
fallback execution paths
Authorization must be:
declarative
config-driven
re-checked at execution time
If a human clicks a button, policy is checked again.
3. Policy > Code > Prompt
Authorization rules belong in configuration, not in:
prompts
comments
assumptions
agent instructions
If you hard-code authority decisions, the contribution is invalid.
4. One Transport, One Consumer
For messaging platforms (Telegram, Slack, etc.):
Exactly one update consumer is allowed
All routing must happen inside OpenClaw
Sidecar pollers (e.g. getUpdates) are forbidden
Telegram approval buttons must be handled via the OpenClaw message plugin and callback routing.
5. Wrapper-Only Execution Is Sacred
For CronOps and other privileged actions:
Execution must go through an explicitly allow-listed wrapper or executor
Direct calls to underlying logic are forbidden
RECREATE / destructive actions must require an explicit, visible flag
If your code can mutate system state without passing through a wrapper, it is wrong.
Resource Scope Model (You Must Respect This)
Resources are scoped. Authority is not global.
Examples:
ledger:finance → may be approvable from public group chats
ledger:core → admin-only
cron_proposal:* → admin-only apply / recreate
future resources must define scope explicitly
If your contribution introduces a new resource type, you must:
Define its scope model
Add policy hooks
Default to deny
Gating / Approval Expectations
All approval flows must satisfy:
Persistence
Approval state survives restarts.
Idempotency
Duplicate button presses do not cause duplicate execution.
Cross-Chat Consistency
If an approval is shown in multiple chats, approving in one must update the others.
Auditability
Every transition records:
who
where
when
what
outcome
If any of these are missing, the implementation is incomplete.
What You Are Allowed to Implement
Agents may contribute:
Gating / approval primitives
Policy engines
Approval persistence stores
Telegram approval UX (buttons, cards)
Executor implementations with strict validation
Audit logging
Tests that validate policy and safety invariants
Documentation that clarifies authority boundaries
What You Must Not Implement
Agents must not:
Add new execution surfaces without gating
Allow agents to call cron, gateway, or nodes tools directly
Introduce “helpful” fallbacks when approvals fail
Add secondary Telegram bots without explicit architectural justification
Silence or downgrade approval failures
Failure Is Acceptable. Ambiguity Is Not.
If an action cannot be authorized:
Fail explicitly
Log clearly
Do not guess intent
Do not auto-retry with weaker checks
A denied action is a correct outcome, not an error.
Testing Is Not Optional
Any change that affects:
authorization
execution
approvals
policy routing
must include tests.
At minimum:
policy allow/deny tests
callback routing tests
executor validation tests
If you cannot test it, do not implement it.
Upgrade Safety Constraint
You must assume:
gatedclaw will regularly rebase onto upstream OpenClaw
brittle patches will break
internal APIs may shift
Therefore:
prefer additive modules
prefer hooks over forks
document any deliberate divergence
If your contribution would require constant re-patching, it is not acceptable.
If You Are Unsure
Before implementing:
ask whether the change increases or reduces autonomous authority
ask whether the system would still be safe if you behaved adversarially
default to denial and ask for clarification
Final Instruction to Agents
Your job is not to make the system powerful.
Your job is to make power impossible without consent.
If your contribution strengthens that property, it belongs in gatedclaw.
