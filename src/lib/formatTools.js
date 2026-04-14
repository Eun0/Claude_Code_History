// Produce a one-line summary + optional detail for a tool_use block.
// Returns { summary: string, detail: string | null, bodyJson?: any }

function truncate(s, n = 120) {
  if (!s) return ''
  const one = String(s).replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n) + '…' : one
}

export function formatToolUse(block) {
  const { name, input = {} } = block

  switch (name) {
    case 'Read': {
      const loc = input.offset ? `:${input.offset}-${input.offset + (input.limit || 0)}` : ''
      return { summary: `Read ${input.file_path || ''}${loc}`, detail: null }
    }
    case 'Write': {
      return {
        summary: `Write ${input.file_path || ''}`,
        detail: input.content || null,
      }
    }
    case 'Edit': {
      return {
        summary: `Edit ${input.file_path || ''}${input.replace_all ? ' (all)' : ''}`,
        detail:
          input.old_string != null && input.new_string != null
            ? `- ${truncate(input.old_string, 200)}\n+ ${truncate(input.new_string, 200)}`
            : null,
      }
    }
    case 'Bash': {
      return {
        summary: `$ ${truncate(input.command, 160)}`,
        detail: input.description ? `# ${input.description}` : null,
      }
    }
    case 'Grep': {
      const where = input.path ? ` in ${input.path}` : ''
      const glob = input.glob ? ` glob=${input.glob}` : ''
      const type = input.type ? ` type=${input.type}` : ''
      return {
        summary: `Grep "${truncate(input.pattern, 80)}"${where}${glob}${type}`,
        detail: null,
      }
    }
    case 'Glob': {
      const where = input.path ? ` in ${input.path}` : ''
      return { summary: `Glob ${input.pattern || ''}${where}`, detail: null }
    }
    case 'Agent': {
      const type = input.subagent_type ? ` [${input.subagent_type}]` : ''
      return {
        summary: `Agent${type}: ${input.description || ''}`,
        detail: input.prompt ? truncate(input.prompt, 500) : null,
      }
    }
    case 'Task': {
      return {
        summary: `Task: ${input.description || ''}`,
        detail: input.prompt ? truncate(input.prompt, 500) : null,
      }
    }
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? input.todos : []
      const detail = todos
        .map((t) => {
          const mark =
            t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'
          return `${mark} ${t.content || t.subject || ''}`
        })
        .join('\n')
      return { summary: `TodoWrite (${todos.length} items)`, detail }
    }
    case 'WebFetch': {
      return { summary: `WebFetch ${input.url || ''}`, detail: input.prompt || null }
    }
    case 'WebSearch': {
      return { summary: `WebSearch "${input.query || ''}"`, detail: null }
    }
    case 'Skill': {
      return {
        summary: `Skill: ${input.skill || ''}${input.args ? ` ${input.args}` : ''}`,
        detail: null,
      }
    }
    case 'ExitPlanMode':
      return { summary: 'ExitPlanMode', detail: null }
    case 'ToolSearch':
      return { summary: `ToolSearch "${input.query || ''}"`, detail: null }
    case 'AskUserQuestion': {
      const qs = Array.isArray(input.questions) ? input.questions : []
      const detail = qs.map((q) => `• ${q.question || ''}`).join('\n')
      return { summary: `AskUserQuestion (${qs.length})`, detail }
    }
    default: {
      // Fallback: show name + JSON
      return {
        summary: name || 'tool_use',
        detail: null,
        bodyJson: input,
      }
    }
  }
}

export function toolIcon(name) {
  switch (name) {
    case 'Read':
      return '📖'
    case 'Write':
      return '📝'
    case 'Edit':
      return '✏️'
    case 'Bash':
      return '⌨️'
    case 'Grep':
    case 'Glob':
      return '🔎'
    case 'Agent':
    case 'Task':
      return '🧩'
    case 'TodoWrite':
      return '☑️'
    case 'WebFetch':
    case 'WebSearch':
      return '🌐'
    case 'Skill':
      return '🛠'
    default:
      return '🔧'
  }
}
