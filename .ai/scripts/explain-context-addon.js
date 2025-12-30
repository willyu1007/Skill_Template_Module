#!/usr/bin/env node
/**
 * explain-context-addon.js
 *
 * Quick reference for the repository's context system.
 *
 * NOTE: In the module-first template, context is a CORE capability (not optional).
 */

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           Context System (Module-first)                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  PURPOSE                                                                     ║
║  ───────                                                                     ║
║  Provide a stable, verifiable context layer for AI/LLM interactions.         ║
║  Context is maintained bottom-up from module registries into a derived        ║
║  project registry view.                                                      ║
║                                                                              ║
║  SSOT (MANUAL, VALIDATED)                                                    ║
║  ──────────────────────                                                      ║
║  docs/context/project.registry.json      Project-level context artifacts      ║
║  modules/<module_id>/interact/registry.json Module-local context artifacts   ║
║                                                                              ║
║  DERIVED (OVERWRITABLE)                                                      ║
║  ─────────────────────                                                      ║
║  docs/context/registry.json              Aggregated registry view             ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  AVAILABLE SCRIPTS                                                           ║
║  ─────────────────                                                           ║
║                                                                              ║
║  contextctl.js                                                               ║
║    init              Ensure docs/context skeleton exists                      ║
║    add-artifact      Add an artifact entry (project or module)               ║
║    remove-artifact   Remove an artifact entry                                ║
║    touch             Refresh checksums in SSOT registries                     ║
║    build             Rebuild docs/context/registry.json (derived)             ║
║    verify            Validate registries and checksum mismatches              ║
║                                                                              ║
║  projectctl.js                                                               ║
║    init              Ensure .ai/project/state.json exists                     ║
║    get-context-mode  Print current context mode                               ║
║    set-context-mode  Set mode: contract or snapshot                           ║
║    verify            Basic validation for project state                        ║
║                                                                              ║
║  skillsctl.js                                                                ║
║    list-packs        Show available packs                                     ║
║    enable-pack       Enable a pack (updates sync-manifest + sync)             ║
║    disable-pack      Disable a pack                                           ║
║    sync              Sync skill wrappers to providers                         ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  QUICK START                                                                 ║
║  ───────────                                                                 ║
║  1) node .ai/scripts/contextctl.js init                                      ║
║  2) node .ai/scripts/contextctl.js build                                     ║
║  3) node .ai/scripts/projectctl.js init                                      ║
║                                                                              ║
║  CI CHECKS                                                                   ║
║  ────────                                                                    ║
║  node .ai/scripts/contextctl.js verify --strict                              ║
║  node .ai/scripts/projectctl.js verify                                       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
