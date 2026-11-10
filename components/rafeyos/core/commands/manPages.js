// @ts-check
// One short manual page per command: NAME, SYNOPSIS, DESCRIPTION and OPTIONS. OPTIONS lists only the flags the
// command really takes here. `man` prints the whole page; `<command> --help` prints its synopsis and options.

/**
 * @typedef {readonly [flag: string, text: string]} OptionRow
 * @typedef {{
 *   summary: string,
 *   synopsis: readonly string[],
 *   description: readonly string[],
 *   options?: readonly OptionRow[],
 * }} Page `description` is one string per printed line
 */

const INDENT = '       '
// An option's text sits under its flag, indented once more, as man prints it
const OPTION_TEXT_OFFSET = INDENT
// Where a long-only option starts in --help, so it lines up after the "-x, " of the others
const LONG_ONLY_INDENT = '    '

// bash's echo prints every argument it is given, `--help` included
const PRINTS_HELP_AS_TEXT = new Set(['echo'])
// sudo stops reading its own options at COMMAND, so a later `--help` is COMMAND's
const OPTIONS_END_AT_OPERAND = new Set(['sudo'])

/** @type {OptionRow} */
const HELP_OPTION = ['--help', 'display this help and exit']

/** @param {string} name @returns {Page} */
const opener = (name) => ({
  summary: 'open a file in the app that handles it',
  synopsis: [name === 'gio' ? 'gio open {FILE | email | linkedin}' : `${name} {FILE | email | linkedin}`],
  description: [
    'Open FILE in the app that handles it: folders in Files, text in the Text Editor.',
    'email opens Mail; linkedin opens Rafey\'s LinkedIn profile in a new tab.',
  ],
})

/** @param {string} name @returns {Page} */
const textEditor = (name) => ({
  summary: 'edit a text file',
  synopsis: [`${name} FILE`],
  description: ['Open FILE in the Text Editor.'],
})

/** @type {Page} */
const NANO = {
  summary: 'edit a text file in the terminal',
  synopsis: ['nano [FILE]'],
  description: ['Edit FILE, or a new buffer, in the terminal. ^O writes it out; ^X exits, asking first if it changed.'],
}

/** @param {string} name @returns {Page} */
const missingEditor = (name) => ({
  summary: 'edit a text file',
  synopsis: [`${name} [FILE]`],
  description: [`${name} isn't installed here: FILE opens in nano instead.`],
})

/** @type {Page} */
const ROS = {
  summary: 'start rafeyOS',
  synopsis: ['os'],
  description: ['rafeyOS is already running, so this only says so.'],
}

/** @param {'head' | 'tail'} name @returns {Page} */
const ends = (name) => {
  const which = name === 'head' ? 'first' : 'last'
  return {
    summary: `output the ${which} part of files`,
    synopsis: [`${name} [OPTION]... [FILE]...`],
    description: [
      `Print the ${which} 10 lines of each FILE to standard output.`,
      'With more than one FILE, precede each with a header giving the file name.',
      'With no FILE, or when FILE is -, read standard input.',
    ],
    options: [
      ['-c, --bytes=NUM', `print the ${which} NUM bytes of each file`],
      ['-n, --lines=NUM', `print the ${which} NUM lines instead of the ${which} 10`],
      ['-NUM', 'the same as -n NUM'],
    ],
  }
}

/** @type {Readonly<Record<string, Page>>} */
const PAGES = Object.freeze({
  help: {
    summary: 'list the commands',
    synopsis: ['help'],
    description: ['Print the commands this terminal knows, with a hint for getting started.'],
  },
  bio: { summary: 'who Rafey is', synopsis: ['bio'], description: ['Print a short biography of Rafey.'] },
  skills: { summary: 'what Rafey works with', synopsis: ['skills'], description: ["Print Rafey's skills."] },
  projects: {
    summary: "list Rafey's projects",
    synopsis: ['projects [--3d]'],
    description: ['List the projects, each with a one-line summary.'],
    options: [['--3d', 'open the 3D view of the projects instead']],
  },
  blog: { summary: 'list the blog posts', synopsis: ['blog'], description: ['List the blog posts with their date and reading time.'] },
  music: {
    summary: "Rafey's music",
    synopsis: ['music [story | play]'],
    description: ['story  print his journey as a producer', 'play   play his track', 'With no command, print the usage.'],
  },
  contact: { summary: 'how to reach Rafey', synopsis: ['contact'], description: ['Print his email address and LinkedIn name.'] },
  open: opener('open'),
  'xdg-open': opener('xdg-open'),
  gio: opener('gio'),
  nautilus: {
    summary: 'a file manager for GNOME',
    synopsis: ['nautilus [FOLDER]'],
    description: ['Open FOLDER, or the current folder, in Files.'],
  },
  gedit: textEditor('gedit'),
  'gnome-text-editor': textEditor('gnome-text-editor'),
  nano: NANO,
  vim: missingEditor('vim'),
  vi: missingEditor('vi'),
  os: ROS,
  rafeyos: { ...ROS, synopsis: ['rafeyos'] },
  startx: { ...ROS, synopsis: ['startx'] },
  ls: {
    summary: 'list directory contents',
    synopsis: ['ls [OPTION]... [FILE]...'],
    description: ['List information about the FILEs (the current directory by default).', 'Entries are sorted by name.'],
    options: [
      ['-a', 'do not ignore entries starting with .'],
      ['-A', 'do not list implied . and ..'],
      ['-d', 'list directories themselves, not their contents'],
      ['-h', 'with -l, print sizes like 1K 234M 2G etc.'],
      ['-l', 'use a long listing format'],
      ['-r', 'reverse order while sorting'],
      ['-S', 'sort by file size, largest first'],
      ['-t', 'sort by time, newest first'],
      ['-1', 'list one file per line'],
    ],
  },
  cd: {
    summary: 'change the working directory',
    synopsis: ['cd [DIR]'],
    description: ['Change the current directory to DIR. With no DIR, go to HOME.', 'If DIR is -, go to the previous directory (OLDPWD) and print it.'],
  },
  pwd: { summary: 'print name of current/working directory', synopsis: ['pwd'], description: ['Print the full name of the current directory.'] },
  cat: {
    summary: 'concatenate files and print on the standard output',
    synopsis: ['cat [OPTION]... [FILE]...'],
    description: ['Concatenate FILE(s) to standard output.', 'With no FILE, or when FILE is -, read standard input.'],
    options: [['-n', 'number all output lines']],
  },
  tree: {
    summary: 'list contents of directories in a tree-like format',
    synopsis: ['tree [-ad] [-L level] [DIRECTORY]...'],
    description: ['List the contents of each DIRECTORY (the current directory by default) as a tree,', 'then count its directories and files.'],
    options: [
      ['-a', 'list all files, hidden ones included'],
      ['-d', 'list directories only'],
      ['-L level', 'descend only level directories deep'],
    ],
  },
  find: {
    summary: 'search for files in a directory hierarchy',
    synopsis: ['find [PATH]... [EXPRESSION]'],
    description: ['Walk each PATH (the current directory by default) and print every file that passes', 'all the tests in EXPRESSION.'],
    options: [
      ['-name PATTERN', 'the name matches PATTERN, a shell pattern with * and ?'],
      ['-iname PATTERN', 'like -name, but the match is case-insensitive'],
      ['-type c', 'the file is of type c: f (regular file), d (directory) or l (symbolic link)'],
      ['-maxdepth levels', 'descend at most levels levels below each PATH'],
    ],
  },
  stat: { summary: 'display file status', synopsis: ['stat FILE...'], description: ['Display the status of each FILE.'] },
  mkdir: {
    summary: 'make directories',
    synopsis: ['mkdir [OPTION]... DIRECTORY...'],
    description: ['Create the DIRECTORY(ies), if they do not already exist.'],
    options: [
      ['-p', 'no error if existing, make parent directories as needed'],
      ['-v', 'print a message for each created directory'],
    ],
  },
  rmdir: {
    summary: 'remove empty directories',
    synopsis: ['rmdir [OPTION]... DIRECTORY...'],
    description: ['Remove the DIRECTORY(ies), if they are empty.'],
    options: [['-v', 'output a diagnostic for every directory processed']],
  },
  touch: {
    summary: 'change file timestamps',
    synopsis: ['touch FILE...'],
    description: ['Update the modification time of each FILE to the current time.', 'A FILE that does not exist is created empty.'],
  },
  rm: {
    summary: 'remove files or directories',
    synopsis: ['rm [OPTION]... [FILE]...'],
    description: ['Remove each FILE. Removed files are gone for good: nothing goes to the Trash.'],
    options: [
      ['-f', 'ignore nonexistent files and arguments'],
      ['-r, -R', 'remove directories and their contents recursively'],
      ['-d', 'remove empty directories'],
      ['-v', 'explain what is being done'],
    ],
  },
  cp: {
    summary: 'copy files and directories',
    synopsis: ['cp [OPTION]... SOURCE DEST', 'cp [OPTION]... SOURCE... DIRECTORY'],
    description: ['Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY.'],
    options: [
      ['-n', 'do not overwrite an existing file'],
      ['-r, -R', 'copy directories recursively'],
      ['-v', 'explain what is being done'],
    ],
  },
  mv: {
    summary: 'move (rename) files',
    synopsis: ['mv [OPTION]... SOURCE DEST', 'mv [OPTION]... SOURCE... DIRECTORY'],
    description: ['Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.'],
    options: [
      ['-f', 'do not prompt before overwriting'],
      ['-n', 'do not overwrite an existing file'],
      ['-v', 'explain what is being done'],
    ],
  },
  ln: {
    summary: 'make links between files',
    synopsis: ['ln -s [OPTION]... TARGET LINK_NAME', 'ln -s [OPTION]... TARGET... DIRECTORY'],
    description: ['Create a link to TARGET with the name LINK_NAME, or links in DIRECTORY.', 'Only symbolic links can be made here.'],
    options: [
      ['-f', 'remove existing destination files'],
      ['-s', 'make symbolic links instead of hard links'],
    ],
  },
  echo: {
    summary: 'display a line of text',
    synopsis: ['echo [-neE] [STRING]...'],
    description: ['Echo the STRING(s) to standard output.'],
    options: [
      ['-n', 'do not output the trailing newline'],
      ['-e', 'enable interpretation of backslash escapes'],
      ['-E', 'disable interpretation of backslash escapes (default)'],
    ],
  },
  head: ends('head'),
  tail: ends('tail'),
  wc: {
    summary: 'print newline, word, and byte counts for each file',
    synopsis: ['wc [OPTION]... [FILE]...'],
    description: ['Print newline, word, and byte counts for each FILE, and a total line if more than one', 'FILE is given. With no FILE, or when FILE is -, read standard input.'],
    options: [
      ['-c, --bytes', 'print the byte counts'],
      ['-m, --chars', 'print the character counts'],
      ['-l, --lines', 'print the newline counts'],
      ['-w, --words', 'print the word counts'],
    ],
  },
  grep: {
    summary: 'print lines that match patterns',
    synopsis: ['grep [OPTION]... PATTERNS [FILE]...'],
    description: ['Search for PATTERNS in each FILE and print each line that matches.', 'PATTERNS are JavaScript regular expressions, close to grep -E.'],
    options: [
      ['-E', 'PATTERNS are extended regular expressions (the default here)'],
      ['-F', 'PATTERNS are strings'],
      ['-i', 'ignore case distinctions in patterns and data'],
      ['-w', 'match only whole words'],
      ['-v', 'select non-matching lines'],
      ['-c', 'print only a count of selected lines per FILE'],
      ['-l', 'print only names of FILEs with selected lines'],
      ['-n', 'print line number with output lines'],
      ['-r, -R', 'search directories recursively, the current one when no FILE is given'],
    ],
  },
  sort: {
    summary: 'sort lines of text files',
    synopsis: ['sort [OPTION]... [FILE]...'],
    description: ['Write the sorted concatenation of all FILE(s) to standard output.'],
    options: [
      ['-f', 'fold lower case to upper case characters'],
      ['-n', 'compare according to string numerical value'],
      ['-r', 'reverse the result of comparisons'],
      ['-u', 'output only the first of an equal run'],
    ],
  },
  uniq: {
    summary: 'report or omit repeated lines',
    synopsis: ['uniq [OPTION]... [INPUT [OUTPUT]]'],
    description: ['Filter adjacent matching lines from INPUT (or standard input),', 'writing to OUTPUT (or standard output).'],
    options: [
      ['-c', 'prefix lines by the number of occurrences'],
      ['-d', 'only print duplicate lines, one for each group'],
      ['-u', 'only print unique lines'],
      ['-i', 'ignore differences in case when comparing'],
    ],
  },
  less: {
    summary: 'print a file to the screen',
    synopsis: ['less FILE...'],
    description: ['There is no pager here: less prints each FILE straight to the screen, as cat does.'],
  },
  whoami: { summary: 'print effective user name', synopsis: ['whoami'], description: ['Print the user name you are using.'] },
  uname: {
    summary: 'print system information',
    synopsis: ['uname [OPTION]...'],
    description: ['Print certain system information. With no OPTION, same as -s.'],
    options: [
      ['-a, --all', 'print all information, in the following order'],
      ['-s, --kernel-name', 'print the kernel name'],
      ['-n, --nodename', 'print the network node hostname'],
      ['-r, --kernel-release', 'print the kernel release'],
      ['-m, --machine', 'print the machine hardware name'],
      ['-o, --operating-system', 'print the operating system'],
    ],
  },
  date: {
    summary: 'print the system date and time',
    synopsis: ['date [+FORMAT]'],
    description: [
      'Display the current time, in the given FORMAT. FORMAT controls the output; it can hold:',
      '%a %A  weekday name, short and full    %b %B  month name, short and full',
      '%Y  year    %m  month (01..12)    %d  day of month (01..31)    %e  day, space padded',
      '%H  hour (00..23)    %I  hour (01..12)    %M  minute    %S  second    %p  AM or PM',
      '%j  day of year (001..366)    %Z  time zone    %s  seconds since the epoch    %%  a %',
    ],
  },
  uptime: {
    summary: 'tell how long the system has been running',
    synopsis: ['uptime'],
    description: ['Print the current time, how long this shell has been running, the users and the load.'],
  },
  neofetch: {
    summary: 'A fast, highly customizable system info script',
    synopsis: ['neofetch'],
    description: [
      "Show rafeyOS's logo beside the system: the OS from /etc/os-release and uname, how long the shell has run, the",
      "desktop's style and accent, and the details on Settings → About. Piped, it prints plain text.",
    ],
  },
  'reset-home': {
    summary: "erase the visitor's home, saved settings and history",
    synopsis: ['reset-home'],
    description: [
      'Ask before putting /home/visitor back as it was on the first visit: every file, folder and Trash entry goes,',
      "with the desktop's saved settings and the command history. Only y or yes goes ahead. /home/rafey and /tmp stay.",
      'With standard input, its first line is the answer and nothing is asked.',
    ],
  },
  hostname: { summary: "show the system's host name", synopsis: ['hostname'], description: ['Print the name of this host.'] },
  history: {
    summary: 'display the command history',
    synopsis: ['history [-c] [N]'],
    description: ['List the commands run in every terminal, numbered, from ~/.bash_history.', 'An argument of N lists only the last N.'],
    options: [['-c', 'clear the history by deleting every entry']],
  },
  clear: { summary: 'clear the terminal screen', synopsis: ['clear'], description: ['Clear the screen, leaving a fresh prompt.'] },
  which: {
    summary: 'locate a command',
    synopsis: ['which [FILENAME]...'],
    description: ['Print the path of the file each FILENAME would run, searching PATH.', 'Shell builtins such as cd have no file, so nothing is printed for them.'],
  },
  man: {
    summary: 'an interface to the system reference manuals',
    synopsis: ['man PAGE...'],
    description: ['Print the manual page of each PAGE, a command name.'],
  },
  env: { summary: 'print the environment', synopsis: ['env'], description: ['Print every variable, as NAME=value. The variables are fixed here.'] },
  true: { summary: 'do nothing, successfully', synopsis: ['true'], description: ['Exit with a status code indicating success.'] },
  false: { summary: 'do nothing, unsuccessfully', synopsis: ['false'], description: ['Exit with a status code indicating failure.'] },
  sudo: {
    summary: 'execute a command as another user',
    synopsis: ['sudo COMMAND'],
    description: ['Run COMMAND as the superuser. Visitors are not in the sudoers file.'],
  },
  exit: { summary: 'exit the shell', synopsis: ['exit'], description: ['Close this terminal window.'] },
  logout: { summary: 'leave rafeyOS', synopsis: ['logout'], description: ['Leave rafeyOS and return to the rafey.ai terminal.'] },
  gsettings: {
    summary: 'GSettings configuration tool',
    synopsis: [
      'gsettings get SCHEMA KEY',
      'gsettings set SCHEMA KEY VALUE',
      'gsettings reset SCHEMA KEY',
      'gsettings list-schemas',
      'gsettings list-keys SCHEMA',
      'gsettings list-recursively [SCHEMA]',
    ],
    description: [
      "Read and change the desktop's saved appearance: the style, accent, wallpaper, dock and desktop icons.",
      "VALUE is GVariant text, such as 'prefer-dark', 48 or true. Run list-recursively to see every key.",
    ],
  },
  ps: {
    summary: 'report a snapshot of the current processes',
    synopsis: ['ps [-e | -A | aux]'],
    description: [
      "List the processes running: one for each open window, named as Ubuntu names its app, and each terminal's bash.",
      'A PID is 1000 plus the window\'s number. Every option lists the same processes.',
    ],
    options: [['-e, -A', 'select all processes']],
  },
  kill: {
    summary: 'send a signal to a process',
    synopsis: ['kill [-s SIGSPEC | -n SIGNUM | -SIGSPEC] PID...', 'kill -l [SIGSPEC]'],
    description: [
      'Close the window each PID names, as its close button does: a changed file asks to be saved first.',
      'KILL (9) closes it without asking. Killing your own bash closes the terminal.',
    ],
    options: [
      ['-s SIGSPEC', 'send the signal named SIGSPEC'],
      ['-n SIGNUM', 'send the signal numbered SIGNUM'],
      ['-l', 'list the signal names, or name the signals given'],
    ],
  },
})

/** @param {string} name @returns {Page | null} */
const pageOf = (name) => (Object.hasOwn(PAGES, name) ? PAGES[name] : null)

/** @param {string} name @param {Page} page @returns {readonly OptionRow[]} */
const optionsOf = (name, page) => (PRINTS_HELP_AS_TEXT.has(name) ? page.options ?? [] : [...(page.options ?? []), HELP_OPTION])

/** @param {string} heading @param {readonly string[]} lines */
const section = (heading, lines) => [heading, ...lines.map((line) => (line ? INDENT + line : line))].join('\n')

/**
 * The whole page, as `man` prints it; null for a name with no page.
 * @param {string} name
 * @returns {string | null}
 */
export const manPage = (name) => {
  const page = pageOf(name)
  if (!page) return null
  const options = optionsOf(name, page).flatMap(([flag, text], index) => [...(index ? [''] : []), flag, OPTION_TEXT_OFFSET + text])
  return [
    section('NAME', [`${name} - ${page.summary}`]),
    section('SYNOPSIS', page.synopsis),
    section('DESCRIPTION', page.description),
    section('OPTIONS', options),
  ].join('\n\n')
}

/**
 * What `<name> --help` prints: the synopsis as a usage line, then the options; null for a name with no page.
 * @param {string} name
 * @returns {string | null}
 */
export const helpText = (name) => {
  const page = pageOf(name)
  if (!page) return null
  const [first, ...more] = page.synopsis
  const flags = optionsOf(name, page).map(([flag, text]) => [flag.startsWith('--') ? LONG_ONLY_INDENT + flag : flag, text])
  const width = Math.max(...flags.map(([flag]) => flag.length))
  return [
    `Usage: ${first}`,
    ...more.map((line) => `  or:  ${line}`),
    '',
    ...flags.map(([flag, text]) => `  ${flag.padEnd(width)}  ${text}`),
  ].join('\n')
}

/**
 * The option words in a page's OPTIONS that take the next word as their value: every name in a row whose flag
 * shows one (`-n, --lines=NUM`, `-name PATTERN`).
 * @param {Page | null} page
 * @returns {Set<string>}
 */
const valuedOptions = (page) =>
  new Set(
    (page?.options ?? []).flatMap(([flag]) => {
      const names = flag.split(', ')
      return names.some((option) => /[ =]/.test(option)) ? names.map((option) => option.split(/[ =]/)[0]) : []
    }),
  )

/**
 * Whether a command's words ask for its help, the way GNU tools read them: `--help` anywhere before `--`, unless it
 * is the value of an option that takes one (`find -name --help`). echo never does, as bash's echo prints it; sudo
 * only before its COMMAND.
 * @param {string} name
 * @param {readonly string[]} argv
 */
export const asksForHelp = (name, argv) => {
  if (PRINTS_HELP_AS_TEXT.has(name)) return false
  const valued = valuedOptions(pageOf(name))
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index]
    if (word === '--help') return true
    if (word === '--' || (OPTIONS_END_AT_OPERAND.has(name) && !word.startsWith('-'))) return false
    if (valued.has(word)) index += 1
  }
  return false
}
