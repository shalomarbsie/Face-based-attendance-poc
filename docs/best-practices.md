# Best Practices

## Purpose

This document extracts transferable engineering practices from the BOA chatbot project and generalizes them so they can be reused in other AI assistant, RAG, and multi-channel backend systems.

This is not a description of one repository. It is a reusable architecture and implementation guide.

## 1. Organize By Runtime Responsibility

Use folders that reflect runtime roles rather than generic technical buckets.

Recommended structure:
- `api/`: transport and request/response contracts
- `conversation/`: orchestration, policies, workflows, state machines
- `services/`: external integrations and business capabilities
- `db/`: models, repositories, migrations
- `core/`: config, infrastructure bootstrapping, shared providers
- `prompts/`: prompt assets only
- `utils/`: low-level helpers

Why this works:
- contributors can predict where new code belongs
- transport logic stays separate from conversation logic
- integrations do not leak everywhere

Avoid:
- mixing prompt strings directly into route handlers
- burying conversation flow inside generic service files
- using `utils/` for business logic

## 2. Keep One Shared Backend Core For All Channels

When supporting multiple channels such as web, Telegram, WhatsApp, or voice clients, keep one backend core and treat each channel as an adapter.

Recommended pattern:
- channels normalize incoming requests
- all channels call the same conversation engine
- channels apply only channel-specific formatting and UX behavior

Benefits:
- shared business rules
- lower maintenance cost
- consistent behavior across platforms

Avoid:
- forking conversation logic per channel
- re-implementing auth rules, routing, or RAG behavior independently in each client

## 3. Use Deterministic Logic Before LLM Routing

Do not send every turn directly to an LLM router.

Handle these with deterministic logic first when possible:
- active workflows already in progress
- authentication steps
- explicit confirmations
- short affirmative or negative follow-ups
- menu and starter actions
- static greetings and closings

Then use the model only for bounded classification.

Why this works:
- improves reliability
- reduces latency and token cost
- prevents the model from making avoidable mistakes on obvious cases

Recommended rule:
- let the LLM decide only when deterministic rules cannot already decide safely

## 4. Constrain Router Models With Structured Output

If you use an LLM for routing, constrain it to a strict schema.

Good router outputs include fields like:
- `route`
- `action_name`
- `transformed_query`
- `should_escalate`

Best practice:
- require raw JSON only
- define allowed enum values explicitly
- validate and normalize model output in application code
- provide deterministic fallbacks when parsing fails

Avoid:
- letting the router generate long explanations
- using free-form text as the main control contract

## 5. Use FSMs For Sensitive Or Regulated Workflows

For authentication, OTP, payments, disputes, or regulated actions, prefer explicit finite-state workflows over free-form agent behavior.

FSMs are a strong fit when:
- the sequence of steps is known
- validation rules are clear
- retries and exit behavior matter
- the workflow touches a regulated or external system

Design guidance:
- make each step explicit
- keep state small and inspectable
- define cancel and timeout behavior
- define retry ceilings
- separate prompt copy from state transitions

Avoid:
- letting the model improvise secure flow sequencing
- hiding state transitions in natural language only

## 6. Separate Ephemeral, Durable, And Retrieval State

Treat different kinds of state differently.

Recommended split:
- ephemeral workflow state: Redis or workflow checkpoint store
- durable business state: relational database
- retrieval/content state: vector DB and object storage

Examples:
- auth step or current workflow step belongs in ephemeral state
- user and message history belong in durable state
- embedded documents belong in vector storage
- uploaded source files belong in object storage

Why this works:
- each store is used for what it is good at
- workflows stay resumable without overloading the relational schema

## 7. Reuse One Session Identifier Across Layers

When possible, use the same session identifier across:
- transport requests
- conversation engine thread IDs
- persisted chat history
- channel profile state

Benefits:
- much easier debugging
- simpler observability
- easier replay and traceability
- cleaner handoff between layers

Avoid:
- creating unrelated IDs in every subsystem unless there is a strong need

## 8. Isolate Integrations Behind Focused Service Modules

Wrap external systems in focused service classes or modules.

Good examples of service boundaries:
- storage service
- banking service
- auth/token service
- WhatsApp client
- TTS service
- ASR service

Best practices:
- keep transport details inside the service
- normalize external errors into app-usable forms
- isolate retries, timeouts, and token refresh behavior there

Avoid:
- calling third-party APIs directly from route handlers or graph nodes everywhere

## 9. Keep Prompts In Dedicated Prompt Modules

Prompt text should live outside orchestration code.

Recommended organization:
- `prompts/router.py`
- `prompts/rag.py`
- `prompts/summarizer.py`

Benefits:
- easier review of behavioral changes
- easier prompt iteration
- less noisy workflow code

Additional guidance:
- name prompts by job, not by model
- store only prompt assets there, not calling logic

## 10. Treat Retrieval As A Pipeline, Not A Single Call

Production RAG quality often depends on more than vector similarity.

Recommended retrieval pipeline elements:
- semantic retrieval
- keyword retrieval
- deduplication
- optional reranking
- domain heuristics
- diagnostics for debugging

Useful enhancements:
- document-type awareness such as FAQ vs summary vs free text
- query-shape awareness such as definition vs procedure vs requirements
- retrieval result caching for repeated queries

Avoid:
- assuming top-k vector results are automatically good enough

## 11. Warm Heavy Dependencies At Startup

If your system depends on embeddings, rerankers, ASR, TTS, or large model adapters, preload them before handling traffic when feasible.

Warmup candidates:
- embedding models
- rerankers
- speech models
- LLM provider clients
- auth tokens for upstream business systems

Benefits:
- lower first-request latency
- earlier failure visibility
- more predictable runtime behavior

Tradeoff:
- startup becomes slower and heavier

Use this pattern when request latency matters more than cold-start speed.

## 12. Sanitize At Multiple Boundaries

In LLM systems, sanitization should happen in more than one place.

Recommended boundaries:
- before text is shown to the model
- before text is shown to end users
- before text is adapted for channel-specific formatting

What to sanitize for:
- system prompt leakage
- markup or formatting breakage
- unsupported scripts or encoding noise
- hidden tool traces
- unsafe echoed instructions

Avoid relying on one final cleanup step only.

## 13. Keep Transport Layers Thin When Possible

Your API and webhook modules should mainly do these jobs:
- parse and validate requests
- resolve dependencies
- call orchestration code
- serialize responses

If transport modules start owning business rules, duplication grows quickly.

Practical compromise:
- a transport layer may still coordinate request-specific behavior
- but decision logic should live in conversation, service, or policy modules

## 14. Use Repositories When They Add Clarity, Not Ceremony

A repository layer is useful when it gives you:
- repeated query reuse
- simpler tests
- clearer service code
- isolation from ORM details

It is less useful when it merely wraps trivial one-line queries without adding structure.

Practical guidance:
- use repositories for common aggregate or entity access patterns
- do not force every single DB interaction through deep abstraction if it reduces clarity

## 15. Prefer Feature-Focused Naming

Use naming that exposes intent quickly.

Recommended conventions:
- modules: `snake_case`
- services: `*Service`
- repositories: `*Repository`
- models: singular nouns
- prompt files: named by task
- workflow nodes: named by behavior

Good examples:
- `chat_service.py`
- `document_repo.py`
- `auth_fsm.py`
- `router.py`
- `retrieval.py`

Avoid vague names like:
- `helpers.py`
- `manager.py`
- `common.py`

## 16. Design For Bounded Multi-Language Support

If the product is multilingual, make language a first-class architectural concern.

Recommended approach:
- keep language in request/session state
- localize system responses through explicit dictionaries or templates
- separate retrieval collections when corpora differ materially by language
- use language-aware prompts and validation

Avoid:
- sprinkling ad hoc translation logic everywhere
- assuming one retrieval index works equally well for all languages

## 17. Test Conversation Behavior Directly

For chatbot systems, the highest-value tests are often not full end-to-end tests.

Prioritize tests for:
- routing behavior
- short follow-up handling
- FSM state transitions
- output sanitization
- retrieval selection heuristics
- service orchestration seams

Recommended test structure:
- unit tests for controller and policy logic
- service tests with mocked repositories
- API smoke tests for contracts
- narrow integration tests for important boundaries

Avoid depending only on manual prompt testing.

## 18. Prefer Observability That Follows The Request Path

Log and expose diagnostics using the same conceptual path users follow.

Useful identifiers to log:
- session ID
- channel
- language
- input mode
- action name
- auth step
- retrieval decision summary

Useful diagnostics to keep:
- selected RAG chunks
- rerank scores or selection reasons
- workflow state transitions
- upstream integration failures

This makes production debugging much easier than generic logs alone.

## 19. Use Custom Migrations Carefully

Custom SQL migrations can work well for smaller systems, but they need discipline.

If you avoid a framework such as Alembic:
- keep migration IDs ordered and immutable
- track applied migrations explicitly
- make migrations idempotent when possible
- keep schema changes and model changes in sync

Know the tradeoff:
- simpler startup path
- higher manual coordination burden over time

## 20. Document Current State And Transferable State Separately

For architecture documentation, keep these distinct:
- what this project does today
- what other projects should reuse as a pattern

Why this matters:
- prevents aspirational docs from drifting away from code
- lets teams reuse proven patterns without inheriting accidental project-specific choices

## 21. Recommended Default Blueprint

If you are starting a similar system, this is a strong default:

1. one backend core for all channels
2. typed conversation state
3. deterministic logic before LLM routing
4. strict JSON router outputs
5. FSMs for sensitive actions
6. retrieval pipeline with diagnostics
7. relational DB for durable state
8. Redis for ephemeral workflow state
9. vector DB plus object storage for RAG content
10. prompt assets isolated in dedicated modules
11. integration wrappers per external system
12. focused tests around conversation correctness

## Summary

The most reusable lesson is this: production assistant systems work best when they are not treated as one big prompt. They become maintainable when you split responsibilities clearly, constrain model behavior, preserve explicit state, and isolate integrations.

A strong assistant architecture is usually:
- partially deterministic
- partially model-driven
- explicit about state
- disciplined about boundaries
- designed for debugging from day one

