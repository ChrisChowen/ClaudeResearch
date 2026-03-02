/**
 * Generates the Claude Code hooks configuration JSON for research data capture.
 *
 * All hook events receive JSON on stdin from Claude Code with common fields
 * (session_id, transcript_path, cwd, permission_mode, hook_event_name).
 * Event-specific fields vary by event type.
 */

function generateHooksConfig(participantId, logFile, projectDir, diffDir) {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: `echo '{"event":"session_start","participant":"${participantId}","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' >> '${logFile}'`
            }
          ]
        }
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: `jq -c '{event:"user_prompt",participant:"${participantId}",ts:(now|todate),prompt_length:(.prompt|length)}' >> '${logFile}'`
            }
          ]
        }
      ],
      PreToolUse: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: `jq -c '{event:"tool_use_pre",participant:"${participantId}",tool:.tool_name,ts:(now|todate)}' >> '${logFile}'`
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: `jq -c '{event:"tool_use_post",participant:"${participantId}",tool:.tool_name,ts:(now|todate)}' >> '${logFile}'`
            }
          ]
        },
        {
          matcher: 'Edit|Write',
          hooks: [
            {
              type: 'command',
              command: `cd '${projectDir}' && git add -A 2>/dev/null && DIFF_FILE='${diffDir}/'$(date +%s)'.diff' && git diff --cached > "$DIFF_FILE" 2>/dev/null && git commit -m 'auto: '$(date -u +%Y-%m-%dT%H:%M:%SZ) --allow-empty 2>/dev/null; jq -c '{event:"file_change",participant:"${participantId}",file:.tool_input.file_path,ts:(now|todate)}' >> '${logFile}'`
            }
          ]
        }
      ],
      SessionEnd: [
        {
          hooks: [
            {
              type: 'command',
              command: `echo '{"event":"session_end","participant":"${participantId}","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' >> '${logFile}'`
            }
          ]
        }
      ]
    }
  };
}

module.exports = { generateHooksConfig };
