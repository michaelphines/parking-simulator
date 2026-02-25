# Parallel Parking Simulator

## Project overview
React Native / Expo app that simulates parallel parking with real car dimensions and turning radii. Uses Ackermann steering physics.

## Tech stack
- React Native with Expo SDK 54
- TypeScript
- No external UI libraries — pure RN views for rendering

## Architecture
- `App.tsx` — Main app with all screens (menu, setup, drive), rendering, and physics
- `src/carData.ts` — Car database with verified manufacturer specs (length, width, wheelbase, turning circle)

## Car data
All car specs are from manufacturer/Edmunds data for 2024-2025 models. Do not change these values without citing a source.

## Key conventions
- Measurements: inches for car dimensions, feet for turning circle and world coordinates
- Angles in radians internally, converted to degrees only for rendering
- Physics uses Ackermann steering model with real turning radius from car specs
- Scale: configurable px-per-foot with zoom support

## Testing
```bash
npx tsc --noEmit    # type check
npx expo export --platform web  # verify web build
```
