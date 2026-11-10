'use client'

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import './Terminal.css';
import { useTerminal } from './TerminalProvider';
import LoadingBar from './LoadingBar';
import { loadProjects } from '@/lib/loadProjects';
import { loadRafeyOS } from '@/lib/loadRafeyOS';
import { forgetDesktop, rememberHandoff } from '@/components/rafeyos/session/logic/sessionStore';
import { sessionStorageOrNull } from '@/lib/browserStorage';
import { HomeLine } from '@/components/home/HomeLine';
import { HOME_COMMANDS } from '@/components/home/shell/homeCommands';
import { useHomeShell } from '@/components/home/shell/useHomeShell';
import { complete } from '@/components/rafeyos/core/commands/complete';
import { completionCommands } from '@/components/rafeyos/core/commands/exec';
import { tilde } from '@/components/rafeyos/core/vfs/paths';
import { useCommandRecall } from '@/components/rafeyos/apps/terminal/logic/useCommandRecall';
import { answerKey } from '@/components/rafeyos/apps/terminal/logic/useQuestion';
import { useCursor } from '@/components/rafeyos/apps/terminal/logic/useCursor';

// Long enough to read 'starting rOS…' while the chunk prefetches
const RAFEYOS_ROUTE_DELAY_MS = 450;
// The LoadingBar's run before the 3D projects page
const PROJECTS_3D_DELAY_MS = 5500;
// Offered as ghost text until the visitor runs their first command
const STARTER_SUGGESTION = 'help';
const COMPLETIONS = completionCommands(HOME_COMMANDS);

/** The ghost text after the caret: the rest of `help`, until the first command this visit. */
const ghostFor = ({ started, input, caretIndex }) => (
  !started
    && caretIndex === input.length
    && input.length < STARTER_SUGGESTION.length
    && STARTER_SUGGESTION.startsWith(input)
    ? STARTER_SUGGESTION.slice(input.length)
    : ''
);

/** What the page does for the shell's homepage effects. */
const usePageHandlers = (setShowLoadingBar) => {
  const router = useRouter();
  const rafeyosTimeoutRef = useRef(null);
  useEffect(() => () => clearTimeout(rafeyosTimeoutRef.current), []);

  return {
    newTab: (href) => window.open(href, '_blank'),
    mailto: (href) => {
      window.location.href = href;
    },
    projects3d: () => {
      setShowLoadingBar(true);
      loadProjects();
      setTimeout(() => {
        router.push('/projects');
      }, PROJECTS_3D_DELAY_MS);
    },
    // Clearing the session flag makes the command always boot; only a refresh inside rafeyOS skips it.
    // The window to open is kept only as the route starts, so an unmount that cancels it leaves nothing behind.
    handoff: ({ open }) => {
      forgetDesktop(sessionStorageOrNull());
      loadRafeyOS();
      clearTimeout(rafeyosTimeoutRef.current);
      rafeyosTimeoutRef.current = setTimeout(() => {
        rememberHandoff(sessionStorageOrNull(), open);
        router.push('/os');
      }, RAFEYOS_ROUTE_DELAY_MS);
    },
  };
};

/** Running a line, Tab completion and the ↑/↓ recall, for the prompt's key handler. */
const usePromptKeys = ({ shell, input, setInput }) => {
  const recall = useCommandRecall(shell.shellFs, shell.vfs);
  const tabCount = useRef(0);

  const submit = (command) => {
    setInput('');
    tabCount.current = 0;
    recall.push(command);
    if (shell.run(command).historyCleared) recall.clear();
  };

  const tab = () => {
    tabCount.current += 1;
    // The tree as it is right now, so a file the last line made completes at once
    const context = { ...shell.variables(), vfs: shell.shellFs.vfs(), cwd: shell.cwd, commands: COMPLETIONS, tabCount: tabCount.current };
    const outcome = complete(input, context);
    if (outcome.list) shell.showMatches(input, outcome.list);
    else setInput(outcome.value);
  };

  const keys = {
    Tab: tab,
    ArrowUp: () => {
      const command = recall.older();
      if (command !== null) setInput(command);
    },
    ArrowDown: () => setInput(recall.newer()),
  };

  return { keys, submit, resetTab: () => { tabCount.current = 0; } };
};

/** The prompt, or a command's [y/N] question waiting for its answer. */
const PromptText = ({ cwd, question }) => (question === null ? (
  <span className="prompt">
    visitor
    <span className='base-color'>@</span>
    <span className='hostname'>rafey.ai</span>
    <span className='base-color'>:{tilde(cwd)}$</span>
  </span>
) : <span className="question">{question}</span>);

/** The live prompt line: input, ghost `help` and block cursor. */
const PromptLine = ({ cwd, question, input, inputRef, cursor, ghostSuggestion, onChange, onKeyDown, onGhostTap }) => (
  <div className="terminal-input">
    <PromptText cwd={cwd} question={question} />
    <span className="terminal-input-field">
      <input
        ref={inputRef}
        type="text"
        value={input}
        aria-label="terminal input"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        onChange={onChange}
        onSelect={(e) => cursor.sync(e.target)}
        onKeyUp={(e) => cursor.sync(e.target)}
        onKeyDown={onKeyDown}
        autoFocus
      />
      {ghostSuggestion && (
        <button
          type="button"
          className="ghost-suggestion"
          style={{ left: cursor.left }}
          aria-label={`Run ${STARTER_SUGGESTION}`}
          onClick={(e) => {
            // Keep the terminal's click-to-focus from opening the phone keyboard
            e.stopPropagation();
            onGhostTap();
          }}
        >
          {ghostSuggestion}
        </button>
      )}
      {/* Sits on the first ghost character, which shows through inverted like a real block cursor */}
      <span
        className={`terminal-cursor${cursor.isTyping ? ' is-typing' : ''}`}
        style={{ left: cursor.left }}
        aria-hidden="true"
      >
        {ghostSuggestion.charAt(0)}
      </span>
    </span>
  </div>
);

/** The prompt's key handling: a waiting question first, then the ghost, then Ctrl chords, then the plain keys. */
const keyDownHandler = ({ ghostSuggestion, input, setInput, shell, prompt }) => (e) => {
  if (shell.question !== null && answerKey(e, { session: shell, input, setInput })) return undefined;
  const completesGhost = ghostSuggestion && (
    e.key === 'Tab'
    || (e.key === 'ArrowRight' && e.target.selectionStart === input.length)
  );
  if (completesGhost) {
    e.preventDefault();
    prompt.resetTab();
    return setInput(STARTER_SUGGESTION);
  }
  if (e.key === 'Enter') {
    // Kept from reaching whatever the line opens (nano's buffer, a picker)
    e.preventDefault();
    return prompt.submit(ghostSuggestion && input.trim() === '' ? STARTER_SUGGESTION : input);
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    return shell.clear();
  }
  // Ctrl+Shift+C is copy, so only a plain Ctrl+C interrupts
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    prompt.resetTab();
    setInput('');
    return shell.interrupt(input);
  }
  const handler = prompt.keys[e.key];
  if (!handler) return undefined;
  // Tab stays in the terminal; ↑ would jump the caret to the start of the input
  e.preventDefault();
  return handler();
};

/** Keeps the newest output in view, and the prompt once a foreground program ends. */
const useScrollToEnd = (terminalRef, { entries, foregroundId }) => {
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalRef, entries, foregroundId]);
};

/** Everything the shell printed; `onDone` hears from the panel that held the keyboard. */
const Screen = ({ shell, onDone }) => (
  <div className="terminal-output">
    {shell.entries.map((entry) => (
      <HomeLine
        key={entry.id}
        line={entry.line}
        active={entry.id === shell.foregroundId}
        onDone={(props, options) => onDone(entry.id, props, options)}
        shell={shell}
      />
    ))}
  </div>
);

/** The prompt line's input, cursor and ghost `help`, with the handlers PromptLine takes. */
const usePromptLine = ({ shell, inputRef }) => {
  const { input, setInput } = useTerminal();
  const cursor = useCursor(inputRef, { input, foregroundId: shell.foregroundId });
  const prompt = usePromptKeys({ shell, input, setInput });
  const ghostSuggestion = ghostFor({ started: shell.started, input, caretIndex: cursor.caretIndex });
  const onKeyDown = keyDownHandler({ ghostSuggestion, input, setInput, shell, prompt });

  return {
    input,
    cursor,
    ghostSuggestion,
    onChange: (e) => {
      setInput(e.target.value);
      prompt.resetTab();
      cursor.sync(e.target);
    },
    onKeyDown: (e) => {
      cursor.markTyping();
      onKeyDown(e);
    },
    onGhostTap: () => prompt.submit(STARTER_SUGGESTION),
  };
};

const Terminal = () => {
  const [showLoadingBar, setShowLoadingBar] = useState(false);
  const handlers = usePageHandlers(setShowLoadingBar);
  const shell = useHomeShell({ handlers });
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const promptLine = usePromptLine({ shell, inputRef });

  useScrollToEnd(terminalRef, shell);

  const finish = (entryId, props, { view3d } = {}) => {
    shell.finish(entryId, props);
    if (view3d) handlers.projects3d();
  };

  // Don't steal focus while the visitor is selecting text to copy
  const focusInputOnClick = () => window.getSelection()?.isCollapsed && inputRef.current?.focus();

  if (showLoadingBar) {
    return <div className="terminal" ref={terminalRef} onClick={focusInputOnClick}><LoadingBar /></div>;
  }
  return (
    <div className="terminal" ref={terminalRef} onClick={focusInputOnClick}>
      <Screen shell={shell} onDone={finish} />
      {/* A playing track, the projects picker, the blog picker or nano owns the terminal */}
      {!shell.foregroundId && <PromptLine cwd={shell.cwd} question={shell.question} inputRef={inputRef} {...promptLine} />}
    </div>
  );
};

export default Terminal;
