# AI, LLM and agent features

Use when a model takes part in a trust-sensitive flow: chat assistants, RAG, agent memory,
tool-calling, MCP servers or clients, prompts built from untrusted content, or code that acts on
model output. The key flow is: untrusted content → model or memory → capability or sink.

## Discipline
- Prompt injection alone is not a finding. A finding needs a code-level failure: content reaches
  another user's context, triggers authority the requester lacks, discloses data they can't read,
  or drives a sink they can't reach directly.
- Model output, memory, tool descriptions and MCP responses are untrusted input.
- A system prompt or "guardrail" instruction is not a security control. Count only deterministic
  checks: authorisation on the resource, isolation, allowlists, narrow credentials, confirmation
  bound to the exact action.
- Name the attacker, the affected user, the identity the action runs as, the resource and the
  action.

## Context and memory
- **Indirect injection**: content an attacker can write (documents, web pages, emails, issues, tool
  results) enters another user's model context, where tools or data are available.
- **Context bleed**: conversation history, embeddings, retrieval results or prompt caches not
  scoped by user or tenant in the query itself.
- **Memory poisoning**: low-trust content or model summaries saved as durable memory that later
  shapes another user's or a privileged session.
- **Role confusion**: untrusted text can pose as a system message, earlier turn or tool result
  because prompts are concatenated strings or roles come from the client.

## Tools and actions
- **Tool arguments into sinks**: model-produced arguments reach SQL, shell, file paths, URL fetches
  or privileged APIs without the handler validating them. A JSON schema checks shape, not
  permission.
- **Confused deputy**: the tool runs with a service credential and doesn't re-check that the
  requesting user may do this to this resource.
- **Approval binding**: the user approves one action but a different argument, resource or later
  turn executes; or attacker content causes a side effect the user never asked for.
- **Unbounded loops**: one request can trigger repeated sends, spend or mutations with no budget,
  cancellation or idempotency.

## MCP and sub-agents
- Delegated agents or MCP calls get the full session, credentials or memory instead of the least
  they need; their results are trusted on return.
- Tools or results routed by names or IDs an attacker can influence; one server can claim another's
  tool.
- Tool descriptions or schemas from an MCP server treated as policy or permission.

## Output
- Model output rendered as HTML/Markdown, used in templates, URLs or commands without the sink's
  encoding (see CLIENT-SIDE.md for rendering).
- Prompts that contain secrets or other users' data that a user can get the model to reveal.

## Validation before reporting
Cite the attacker-controlled write and the later read or action that crosses the boundary. For
confused-deputy claims, show the handler lacks a user-and-resource check and that the attacker
couldn't do the same thing directly.
