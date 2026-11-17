# live-work: see what Claude is thinking about

A Claude Code CLI mod that draws a live, animated tree above the prompt showing what Claude is working on, with aura colours that follow the work.

```
          ∙•●•  ┏━━━━━━━━━━━━━━┓  •●•∙   2 live · 9 steps  ◈ gold
                ┃  ✦ CLAUDE ⠹  ┃
                ┗━━━━━━━┯━━━━━━┛
          ┌──●━━━━━─────┴──────────────┐
   ┏━━━━━━┷━━━━━━━┓             ╭──────┴───────╮
   ┃   ▸ src      ┃             │   terminal   │
   ┗━━━━━━┯━━━━━━━┛             ╰──────┬───────╯
          │                            │
   ┏━━━━━━┷━━━━━━━┓•            ╭──────┴───────╮
   ┃ ✎ app.ts   ⠼ ┃∙            │ ❯ Run tests ✓│
   ┗━━━━━━━━━━━━━━┛             ╰──────────────╯
  ↳ Editing app.ts ▌
```

## What it does

- A **CLAUDE** box at the top, with a line down to one box per place Claude is working: a folder, the terminal, search, the web, a connector or a helper agent.
- Every file Claude reads or edits gets its own box under its folder (up to 3, then "+N more"). Boxes stay for the whole turn, so you see everything Claude touched.
- When the turn ends, the tree folds into one line: `✦ done · 12 steps · 4 files · changed app.ts, notes.md`.

## Animations

- **Comet pulses**: a coloured dot with a 5-cell gradient tail runs from CLAUDE down to the box being worked on, and a green one runs home when the step finishes.
- **Aura borders**: colour gradients chase around the borders of live boxes.
- **Wings**: dots breathe out from both sides of the CLAUDE box, with stars twinkling at its corners.
- **Embers**: sparks rise up the sides of live boxes.
- **Done burst**: sparkles pop at a box's corners when its step finishes, then it settles to ✓ (or a red ✗ on failure).
- Labels shimmer, new names type themselves in, and the activity line has a blinking cursor.

## Aura colours

- **mood** (default): the colour follows the work. Reading is ocean, editing is gold, commands are matrix green, web is ice, and errors flash fire red.
- `/aura <name>` picks a fixed aura and remembers it: `violet`, `ocean`, `sunset`, `matrix`, `gold`, `ice`, `fire`, `rainbow`, or `mood`. `/aura` alone shows the current one.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install live-work --marketplace Brawly0/claude-cli-better-thinking-mod
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install live-work --marketplace Brawly0/claude-cli-better-thinking-mod
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Brawly0/claude-cli-better-thinking-mod`, then Add plugin.

Best in a truecolor terminal (Windows Terminal, iTerm2, most Linux terminals).

## License

MIT
