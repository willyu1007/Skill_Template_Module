---
name: author-developer-documentation
description: Author or update developer documentation by gathering context, structuring content progressively, and providing verifiable examples.
---

# Author Developer Documentation

## Purpose
Create high-quality developer documentation that is accurate, discoverable, and actionable, using progressive disclosure and verifiable guidance.

## When to use
Use this skill when:
- You implemented a new feature and need docs
- You changed an API contract and must update references
- A workflow is complex and needs an explanation and examples
- Onboarding friction indicates missing or outdated docs

## Inputs
- The code or feature to document
- Intended audience (new contributor, on-call engineer, API consumer)
- Required level of detail (overview vs deep reference)
- Constraints (avoid repo-specific paths/scripts unless explicitly allowed)

## Outputs
- A documentation plan:
  - what files to create/update
  - what information belongs where
- Documentation content:
  - overview and purpose
  - step-by-step instructions
  - verification steps
  - troubleshooting notes
- Examples and templates placed in dedicated subfolders where applicable

## Documentation principles
- Start with the conclusion: what the reader can do after reading.
- One paragraph SHOULD have one intent.
- Use **MUST/SHOULD/MAY** to express requirements clearly.
- Prefer progressive disclosure:
  - keep top-level docs short
  - move deep details to references, examples, and templates
- Avoid unnecessary cross-linking that forces readers to chase multiple files for basic understanding.

## Steps
1. Gather context:
   - read existing docs
   - inspect relevant code paths
   - identify assumptions and environment constraints
2. Define the doc structure:
   - overview
   - when to use
   - inputs/outputs
   - workflow steps
   - verification
   - troubleshooting
3. Write the first draft:
   - include minimal "happy path" first
   - then add edge cases and deeper sections
4. Add examples/templates:
   - when appropriate, move long code blocks into an `examples/` folder adjacent to the doc
   - when appropriate, provide reusable scaffolds in a `templates/` folder adjacent to the doc
5. QA:
   - verify examples are coherent and do not include secrets
   - ensure requirements are explicit
   - ensure the doc matches current implementation

## Verification

- [ ] Documentation structure follows the defined outline
- [ ] Examples are coherent and do not include secrets
- [ ] Requirements are explicit (MUST/SHOULD/MAY)
- [ ] Documentation matches current implementation
- [ ] Progressive disclosure is applied (top-level docs are short)
- [ ] Verification steps are included and actionable

## Boundaries

- MUST NOT include secrets, credentials, or internal-only URLs in documentation
- MUST NOT create documentation that exceeds 500 lines without progressive disclosure
- MUST NOT copy large code blocks verbatim; use references or minimal excerpts
- SHOULD NOT mix multiple topics in a single document section
- SHOULD NOT force readers to chase multiple files for basic understanding
- SHOULD NOT skip verification steps in documentation

## Included assets
- Templates: `./templates/` includes a documentation outline.
