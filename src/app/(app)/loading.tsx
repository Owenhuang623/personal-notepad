/**
 * Shown the moment a navigation starts, so clicking a note swaps the pane
 * immediately instead of freezing on the previous one while the server renders.
 * Mirrors the editor's chrome exactly so nothing shifts when the real page lands.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b border-line px-3 sm:px-5">
        <div className="h-3 w-32 animate-pulse rounded-full bg-hover" />
      </header>
    </div>
  );
}
