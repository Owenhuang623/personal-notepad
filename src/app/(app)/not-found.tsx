import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[14px] text-ink-muted">That note doesn&rsquo;t exist.</p>
      <Link href="/" className="text-[13.5px] underline underline-offset-4 hover:text-ink">
        Back to the scratchpad
      </Link>
    </div>
  );
}
