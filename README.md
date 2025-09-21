
# Going Viral


A mobile-first, pass-and-play social deduction mini-game inspired by Mafia/Werewolf with microbiology-themed roles.

## Tech
- 100% browser-based: HTML, CSS, and Vanilla JS
- No backend, no build step

## How to run

### Online (Recommended)
Play directly in your browser at: **https://kcicek.github.io/goingviral**

### Local Development
Open `index.html` in your browser. On Windows:

- Double-click the file, or
- Drag it into a browser window.

If your browser blocks ES modules from the filesystem, serve locally:

- PowerShell with Python:

```powershell
cd c:\Users\kcice\Documents\VibeCodingProjects\goingviral
python -m http.server 5500
```

Then open http://localhost:5500

## Gameplay flow
1. Setup: choose players (3–8). Roles are assigned (1 Virus, +1 Immune if ≥4, rest Hosts).
2. Identity Reveal: each player privately reveals their role and hint; hide & pass.
3. Discussion: talk offline to decide suspect.
4. Voting: each player taps a suspect; votes are stored.
5. Results: show vote counts, reveal Virus, announce winner.

## Files
- `index.html` — basic layout, includes scripts
- `style.css` — dark lab theme with responsive styles
- `roles.js` — role definitions, emoji, hints, role assignment
- `ui.js` — rendering helpers and small UI components
- `game.js` — state machine and phase logic

## Extend (ideas)
- Animated card flips on reveal
- Countdown timer for discussion
- More roles (Scientist, Doctor, Super-Spreader)
- Scoreboard across rounds
- Online multiplayer

## Notes
- Code is modular and commented for easy expansion.
- Voting allows self-votes; ties eliminate all top vote-getters.
