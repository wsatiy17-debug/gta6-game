# gta6-game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/wsatiy17-debug/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/wsatiy17-debug/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**NEON BAY** — an open-world crime game in the spirit of GTA 6, built for make.fun's "Make GTA 6" bounty. Explore a sun-soaked coastal city on foot and by car, steal cars, outrun the police, and work your way through five story missions for the fixer Vera Solano. Vanilla JavaScript and Canvas 2D, no libraries, no network — the whole game is static files under `game/`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Or serve `game/` with any static file server.

## How to play

You are Kai Mercer, a driver-for-hire new to Neon Bay. Vera Solano has work for you — follow the yellow marker on the minimap to start a mission. Earn cash, buy your way up, and don't get caught.

### Controls

| Key | Action |
| --- | --- |
| W / A / S / D or arrows | Move on foot / drive |
| Shift | Sprint (on foot) |
| E | Enter / exit car |
| Space | Handbrake (in car) |
| Mouse + click | Aim and shoot |
| F | Punch |
| H | Horn |
| M | Mute sound |
| P / Esc | Pause |
| R | Restart after wasted / busted |

### Features

- A full open-world city: roads, blocks, buildings, a beach, a park, traffic lights and palm trees
- Cars to steal and drive — sedans, taxis, trucks, sports cars — with arcade handling, damage, smoke and explosions
- Traffic cars and pedestrians with simple AI; pedestrians flee from gunfire
- Wanted level (1–5 stars) with police cars and foot cops who chase, ram and arrest you
- Five story missions with objectives, timers and payouts, plus free-roam progression
- Combat on foot: pistol and fists, with health and a wanted response
- HUD with health, cash, wanted stars, speedometer and a live minimap
- Start screen, pause menu, wasted / busted screens, and save / continue via localStorage
- Synthesized sound: engine hum, police sirens, gunshots, music — all generated with the Web Audio API, no audio files

## Layout

- `game/index.html` — the page: canvas, HUD and menus
- `game/src/main.js` — game loop, state machine and camera
- `game/src/city.js` — city generation and collision
- `game/src/vehicles.js` — car physics and traffic AI
- `game/src/pedestrians.js` — pedestrian AI
- `game/src/police.js` — wanted level and police AI
- `game/src/combat.js` — shooting, fists and damage
- `game/src/missions.js` — story missions and objectives
- `game/src/render.js` — all canvas drawing, including the minimap
- `game/src/audio.js` — synthesized sound effects and music
- `game/src/save.js` — localStorage save / load
- `game/src/shots.js` — scripted scenes for screenshots (`?shot=…`)
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
