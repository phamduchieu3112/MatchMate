export default function HostMatchDetailLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-8 w-24 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      <div className="h-56 rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />

      <div className="h-12 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />

      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    </div>
  );
}
