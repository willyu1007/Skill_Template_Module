---
name: perform-web-research
description: Perform targeted web research by defining questions, finding primary sources, extracting evidence, and producing a cited, decision-oriented summary.
---

# Perform Web Research

## Purpose
Produce high-signal research outputs that are actionable and evidence-backed, without over-relying on low-quality sources.

## When to use
Use this skill when:
- You need up-to-date information (APIs, specs, releases, regulations)
- You must compare options (libraries, services, standards)
- You need citations for a technical or product decision
- You suspect prior knowledge may be outdated

## Inputs
- Research question(s) and decision context
- Constraints (time, allowed sources, required recency)
- Definitions of success (what the output must enable)

## Outputs
- A cited summary answering the question
- A short list of recommended actions or options (if applicable)
- A log of key sources and why they were trusted

## Source selection rules
- Prefer primary sources:
  - official documentation
  - standards bodies
  - release notes
  - peer-reviewed papers
- Use reputable secondary sources only when needed to interpret.
- Treat low-quality sources as last resort and label them clearly.

## Steps
1. Clarify the question and required freshness.
2. Identify 3–5 primary sources as anchors.
3. Extract facts and constraints; avoid assumptions.
4. Cross-check conflicting claims across multiple sources.
5. Produce a decision-oriented write-up:
   - what is true
   - what is uncertain
   - what to do next

## Verification

- [ ] Research question is clearly defined
- [ ] At least 3 primary sources are identified
- [ ] Facts are cross-checked across multiple sources
- [ ] Citations are accurate and verifiable
- [ ] Summary distinguishes facts from uncertainties
- [ ] Recommendations are actionable and evidence-backed

## Boundaries

- MUST NOT fabricate or hallucinate sources and citations
- MUST NOT present opinions as facts; always cite sources
- MUST NOT rely solely on a single source for critical decisions
- SHOULD NOT use outdated information without noting the recency risk
- SHOULD NOT use low-quality sources (forums, outdated blogs) as primary evidence
- SHOULD NOT skip cross-checking conflicting claims

## Included assets
- Templates: `./templates/` includes a research brief and evidence table format.
