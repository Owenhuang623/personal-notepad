/**
 * Renders nothing: AppShell draws the open note from the list it already holds,
 * so a note never waits on a server render. The route exists so that /n/<id>
 * resolves on a reload or a shared link — the layout sends every note along.
 */
export default function NotePage() {
  return null;
}
