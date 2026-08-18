# FinoBackoffice

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## CI/CD

Two GitHub Actions workflows own the pipeline:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pull requests targeting `main` or `develop` | Installs dependencies, runs the unit tests and a production build against the placeholder values in `.env.example`. |
| `.github/workflows/deploy.yml` | Pushes to `main` or `develop` | Runs the same checks, then builds and deploys through the Vercel CLI. `develop` ships a preview deployment, `main` ships to production. |

Deployments run from GitHub Actions rather than from Vercel's Git integration, so
a red test suite blocks the deploy. Automatic Vercel deployments for `main` and
`develop` are therefore disabled in `vercel.json` (`git.deploymentEnabled`).

### Required secrets

The deploy job runs under the GitHub environment named `deploy`, so these must
be added as **environment secrets** of that environment (Settings >
Environments > deploy), not as repository secrets.

| Secret | Where to get it |
| --- | --- |
| `VERCEL_TOKEN` | Vercel dashboard > Account Settings > Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` after running `vercel link`, field `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after running `vercel link`, field `projectId` |

### Application environment variables

The build reads its configuration from environment variables (see
`.env.example`). CI only needs the placeholders, but the deploy job pulls the
real values from the Vercel project, so every key in `.env.example` must be set
in Vercel under both the Production and the Preview environment.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
