# backend

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines , Hono, NONE, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Hono** - Lightweight, performant server framework
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine

## Getting Started

First, install the dependencies:

```bash
bun install
```
## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:
```bash
bun db:push
```

Then, run the development server:

```bash
bun dev
```

The API is running at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
backend/
├── db/           # Database schema and migrations
├── lib/          # Library utilities
├── routers/      # API routers
├── index.ts      # Server entry point
├── drizzle.config.ts
├── tsconfig.json
├── package.json
├── .env.example
```

## Available Scripts

- `bun dev`: Start the server in development mode
- `bun build`: Build the application
- `bun check-types`: Check TypeScript types
- `bun db:push`: Push schema changes to database
- `bun db:studio`: Open database studio UI
