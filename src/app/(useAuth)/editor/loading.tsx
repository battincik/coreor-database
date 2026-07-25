export default function EditorLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[20%] min-w-60 max-w-80 flex-col border-r border-zinc-800">
          <div className="space-y-2 border-b border-zinc-800 p-2">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
              <div className="h-6 w-6 animate-pulse rounded bg-zinc-900" />
            </div>
            <div className="h-8 animate-pulse rounded-md border border-zinc-800 bg-zinc-900/70" />
            <div className="flex gap-2 border-t border-zinc-800 pt-2">
              <div className="h-7 flex-1 animate-pulse rounded-md bg-zinc-900" />
              <div className="h-7 w-20 animate-pulse rounded-md bg-zinc-900" />
            </div>
          </div>

          <div className="flex-1 space-y-2 p-3">
            {[72, 58, 82, 64].map((width, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 animate-pulse rounded bg-zinc-800" style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-zinc-800 p-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-zinc-900" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex h-8 items-center gap-2 border-b border-zinc-800 px-3">
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="flex h-8 items-center gap-3 border-b border-zinc-800 px-2">
            <div className="h-3 w-14 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-12 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-10 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="grid grid-cols-[1fr_110px] border-b border-zinc-800">
            <div className="h-9 border-r border-zinc-800 bg-zinc-900/40" />
            <div className="h-9 bg-zinc-900/40" />
          </div>
          <div className="flex h-[calc(100%-5rem)] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="h-10 w-10 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
              <div className="h-4 w-44 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-64 max-w-[80vw] animate-pulse rounded bg-zinc-900" />
            </div>
          </div>
        </main>
      </div>

      <div className="h-8 border-t border-zinc-800 bg-zinc-950 px-2 py-2">
        <div className="h-3 w-40 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="flex h-7 items-center justify-between border-t border-zinc-800 px-2">
        <div className="h-2.5 w-64 animate-pulse rounded bg-zinc-900" />
        <div className="h-2.5 w-40 animate-pulse rounded bg-zinc-900" />
      </div>
    </div>
  );
}
