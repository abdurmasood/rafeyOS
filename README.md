# rafeyOS — Web based Linux + Mac OS

A terminal and an Ubuntu 24.04-style + Mac desktop that share one shell and one filesystem. Type commands at `/`, or point and click at `/os`. Everything you make stays in your browser.

**[Open rafeyOS](https://rafey.ai)** — the terminal is the front door; run `startx` for the desktop

## Features

### Terminal

- Bash-like shell with pipes, `&&` `||` `;`, `>` `>>`, quotes, globs and `$VARS`
- 60 commands, each with `--help`; `man <command>` works too
- Tab completion, shared history and a built-in `nano`
- Pickers for projects and blog posts, and a music player with a story timeline
- `singularity` is a black hole simulation drawn in characters, each one a traced ray of light

### Filesystem

- One virtual tree behind both the terminal and the desktop
- `/home/rafey` holds the portfolio, read-only
- `/home/visitor` is yours, saved to localStorage and synced across tabs
- New folder, rename, trash and restore; `/tmp` clears on reload

### Desktop

- GNOME 46 and Yaru replica: top bar, Activities overview, Quick Settings
- Window manager with drag, 8-way resize, edge snapping and maximize
- Dock with magnification, right-click menus and launch bounce
- Lock, suspend, restart, and log out back to the terminal
- Wallpapers and accent colours, from Settings or `gsettings`

### Built-in Applications

- **Files** — Nautilus-style browser with sidebar, path bar, search, rename and trash
- **Terminal** — the same shell as `/`, also on Ctrl+Alt+T
- **Text Editor** — writes into your home folder
- **Music** — Amberol-style player that keeps playing after you close it
- **Mail** — compose window that sends through your mail app
- **Settings** — appearance, dock, sound, notifications, and an About page for Rafey's hardware

## Quick Start

```console
visitor@rafey.ai:~$ ls /home/rafey
bio.txt  blog  contact  Music  projects  README.txt  skills.txt
visitor@rafey.ai:~$ echo "hi rafey" > ~/Desktop/hello.txt
→ visible in rafeyOS
visitor@rafey.ai:~$ startx
```

`hello.txt` is now on the desktop. Run `help` for the rest.

## Project Structure

```
├── app/                  # Routes: / terminal, /os desktop
├── components/
│   ├── home/             # The terminal at /, with nano and the pickers
│   └── rafeyos/
│       ├── apps/         # Files, Terminal, Editor, Music, Mail, Settings
│       ├── core/         # Shell commands, virtual filesystem, themes, settings
│       ├── shell/        # Top bar, dock, desktop icons, Activities, menus
│       ├── wm/           # Window manager
│       ├── session/      # Boot, lock, suspend, log out
│       └── styles/       # Yaru-style CSS, scoped to /os
├── lib/                  # Content: bio, projects, blog, skills, music, contact
├── public/               # Favicon and the music track
└── tests/                # Vitest suites for home, lib and rafeyos
```

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18
- **3D:** three.js, React Three Fiber, drei
- **Styling:** Tailwind CSS on `/`, scoped CSS for rafeyOS
- **Fonts:** JetBrains Mono, Ubuntu Sans
- **Storage:** localStorage, synced across tabs
- **Testing:** Vitest, Testing Library, jsdom
- **Deployment:** Vercel

## Scripts

```bash
pnpm dev         # Start the dev server on localhost:3000
pnpm build       # Build for production
pnpm start       # Serve the production build
pnpm test        # Run Vitest with coverage (80% gate)
pnpm lint        # Run ESLint
pnpm typecheck   # Type-check rafeyOS's // @ts-check files
```

Every script also has a `just` recipe.

## License

MIT — see [LICENSE](LICENSE). The Ubuntu Sans fonts in `app/os/fonts/` keep their own [Ubuntu Font Licence](app/os/fonts/LICENSE.txt).

---

rafeyOS, made by Rafey Masood
https://rafey.ai
