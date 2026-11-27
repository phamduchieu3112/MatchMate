export default function HostLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="h-9 w-48 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex gap-2">
          <div className="h-10 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-10 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          />
        ))}
      </div>
    </div>
  );
}
