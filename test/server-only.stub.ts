/**
 * Stands in for the `server-only` package under Vitest.
 *
 * That package deliberately throws unless the bundler resolved it through the
 * `react-server` condition, which is how a stray import into a client component
 * becomes a build error rather than a leaked database URL. The test runner is
 * neither bundler, so it is pointed here instead — the guarantee still holds
 * where it matters, in `next build`.
 */
export {};
