# Behavioral Guidelines for AI Coding

These guidelines are adapted from [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills/tree/main). They bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Memory System (memory.md)

- **On conversation start**: Read `memory.md` first to restore context.
- **Every 3 user interactions**: Append a summary to the `memory.md` "对话摘要" section covering key decisions, progress, and changes.
- **Summary format**: Timestamp + brief bullet points of what was done/decided. Clear old task status; keep what's still relevant.

## Project-Specific Context

- **Tech Stack**: Next.js 15 (App Router), Prisma 7.x (SQLite), Polygon blockchain (Amoy testnet), ethers.js v6, MetaMask, NextAuth.js
- **Code Style**: Concise, precise, no redundancy. User explicitly prefers "干练精准" code.
- **Workflow**: Step-by-step with user confirmation. Write one piece, pause, get approval, then continue.
- **Key Constraints**: No emojis in code/comments. No speculative features. No premature production deployment (contract deployment deferred until project launch).
- **Contract Deployment**: Deferred. Currently using mock contract address. `CONTRACT_OWNER_PK` must be provided by user when deploying.
