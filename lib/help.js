// Help text for the home terminal. Rows are HTML (rendered with dangerouslySetInnerHTML)

// Descriptions start at this column so every row lines up
const DESCRIPTION_COLUMN = 15
const INDENT = '  '

export const helpRow = (name, description) =>
  `${INDENT}${name.padEnd(DESCRIPTION_COLUMN - INDENT.length)}${description}`

// Neither terminal lists music; typing the command still works.
const COMMAND_ROWS = Object.freeze([
  helpRow('bio', 'biography'),
  helpRow('skills', 'toolkit'),
  helpRow('projects', 'body of work'),
  helpRow('blog', 'thoughts'),
  helpRow('contact', 'get in touch'),
])

const PROGRAM_ROWS = Object.freeze([helpRow('singularity', 'black hole simulation')])

const HEADER = 'Available commands:'
const PROGRAMS_HEADER = 'Programs:'

const helpLines = (programRows) =>
  Object.freeze([HEADER, '', ...COMMAND_ROWS, '', PROGRAMS_HEADER, '', ...programRows, ''])

/** The shared command list; rafeyOS's own terminal shows exactly this. */
export const HELP_LINES = helpLines(PROGRAM_ROWS)

export const HELP_HINT = "<span class='grey'>Use ↑ for history, tab to autocomplete, 'clear' to reset.</span>"

export const STARTX_HELP_LINE = helpRow('startx', 'start the desktop')

/** The home terminal's list: the shared rows plus startx as the last program. */
export const HOME_HELP_LINES = helpLines([...PROGRAM_ROWS, STARTX_HELP_LINE])
