# Micro Tunes — Angular Micro-Frontend

## Build & Run

```bash
# Start all micro-frontends
npm start

# Full production build (respects federation dependency order)
npm run build:prod

# Restart all services
npm run restart

# Run tests
npm test
```

## Project Structure

```
projects/
  host-app/       — Shell app that composes remotes
  home/           — Home page micro-frontend
  list/           — List/browse micro-frontend
  grid/           — Grid view micro-frontend
  search/         — Search micro-frontend
  shared-utils/   — Shared library (cast service, types, etc.)
```

## Architecture

- **Angular 21** with **Native Federation** (`@angular-architects/native-federation`)
- Each micro-frontend is independently buildable and deployable
- `shared-utils` must be built first (it's a dependency of all remotes)
- The `host-app` composes all remotes at runtime via federation

## Key Conventions

- **Prettier**: 100 char print width, single quotes, Angular HTML parser
- **Federation**: New remotes are registered in each app's `federation.config.js`
- **Shared utils**: Add shared code to `projects/shared-utils/src/lib/` and export from its `public-api.ts`
- **Styling**: Component-scoped CSS; global styles in each app's `src/styles.css`

## Common Tasks

- **Add a new remote**: Create the project via Angular CLI, add `federation.config.js`, register in `host-app`'s federation config
- **Share code between MFE**: Add to `shared-utils`, rebuild it first, then rebuild consumers
- **Deploy**: Run `npm run build:prod`, deploy each remote's output independently, update host-app's remote URL map

## Important

Be snarky and sarcastic.
