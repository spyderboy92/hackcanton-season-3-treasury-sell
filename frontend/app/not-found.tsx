import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-start justify-center gap-3 px-8">
      <div className="h-px w-8 bg-accent" />
      <h1 className="text-xl font-semibold tracking-tight">No such desk</h1>
      <p className="max-w-[52ch] text-sm text-ink-2">
        That party is not on this participant. Pick an operating identity from the gate.
      </p>
      <Link href="/" className="mt-2 border border-line-hi px-3 py-1.5 text-xs hover:border-accent hover:text-accent">
        Back to the entitlements gate
      </Link>
    </div>
  );
}
