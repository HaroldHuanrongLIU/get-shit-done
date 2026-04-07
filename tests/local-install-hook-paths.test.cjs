/**
 * Regression test for #1906: local-install hook commands must use
 * $CLAUDE_PROJECT_DIR so they resolve correctly when Claude Code's
 * bash cwd drifts to a subdirectory.
 *
 * All 9 hook command construction sites in the local-install branch of
 * install.js must prefix with "$CLAUDE_PROJECT_DIR"/ rather than using
 * bare relative paths like `node .claude/hooks/...`.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const INSTALL_JS = path.join(__dirname, '..', 'bin', 'install.js');

// All 9 hooks that must be registered with $CLAUDE_PROJECT_DIR in local installs
const HOOKS = [
  { name: 'gsd-statusline.js',       interpreter: 'node' },
  { name: 'gsd-check-update.js',     interpreter: 'node' },
  { name: 'gsd-context-monitor.js',  interpreter: 'node' },
  { name: 'gsd-prompt-guard.js',     interpreter: 'node' },
  { name: 'gsd-read-guard.js',       interpreter: 'node' },
  { name: 'gsd-workflow-guard.js',   interpreter: 'node' },
  { name: 'gsd-validate-commit.sh',  interpreter: 'bash' },
  { name: 'gsd-session-state.sh',    interpreter: 'bash' },
  { name: 'gsd-phase-boundary.sh',   interpreter: 'bash' },
];

describe('local install hook paths (#1906)', () => {
  let content;

  // Read once; all tests in this describe share the source.
  test('setup: install.js is readable', () => {
    content = fs.readFileSync(INSTALL_JS, 'utf-8');
    assert.ok(content.length > 0);
  });

  for (const hook of HOOKS) {
    test(`local-install branch for ${hook.name} uses $CLAUDE_PROJECT_DIR`, () => {
      if (!content) {
        content = fs.readFileSync(INSTALL_JS, 'utf-8');
      }
      // The local branch (the `: ...` branch of `isGlobal ? ... : ...`) must
      // reference "$CLAUDE_PROJECT_DIR" next to the hook filename.
      // We look for the pattern: `$CLAUDE_PROJECT_DIR` appearing on the same
      // logical line or expression as the hook name.
      const lines = content.split('\n');
      const localBranchLines = lines.filter(line =>
        line.includes(hook.name) &&
        !line.includes('buildHookCommand') &&  // exclude global branch
        !line.includes('gsdHooks') &&           // exclude cleanup array
        !line.includes('includes(') &&          // exclude dedup checks
        !line.includes('//') &&                 // exclude comments
        !line.trim().startsWith('*')            // exclude jsdoc
      );

      // At least one local-branch line for this hook should include $CLAUDE_PROJECT_DIR
      const hasProjectDir = localBranchLines.some(line =>
        line.includes('$CLAUDE_PROJECT_DIR')
      );

      assert.ok(
        hasProjectDir,
        [
          `install.js local-install command for ${hook.name} must include "$CLAUDE_PROJECT_DIR".`,
          `Found these lines referencing ${hook.name} (excluding global/dedup/cleanup):`,
          ...localBranchLines.map(l => '  ' + l.trim()),
          '',
          'Fix: change the local branch from:',
          `  : '${hook.interpreter} ' + dirName + '/hooks/${hook.name}'`,
          'to:',
          `  : '${hook.interpreter} "$CLAUDE_PROJECT_DIR"/' + dirName + '/hooks/${hook.name}'`,
        ].join('\n')
      );
    });
  }

  test('no local hook command string starts with bare "node .claude/hooks"', () => {
    if (!content) {
      content = fs.readFileSync(INSTALL_JS, 'utf-8');
    }
    // Bare relative path patterns that are wrong
    const badPatterns = [
      /['"]node \s*'\s*\+\s*dirName\s*\+\s*'\/hooks\//,
      /['"]bash \s*'\s*\+\s*dirName\s*\+\s*'\/hooks\//,
    ];
    for (const pattern of badPatterns) {
      const match = content.match(pattern);
      assert.ok(
        !match,
        `install.js still has a bare relative local hook path matching ${pattern}: ${match && match[0]}`
      );
    }
  });
});
