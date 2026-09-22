// Synchronous acquisition closes the check/start race in event handlers.
export function createActivityGate() {
  const jobs = new Set<symbol>();
  const blockers = new Set<symbol>();
  const listeners = new Set<() => void>();
  let installing = false;
  const emit = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    count: () => jobs.size + blockers.size,
    isInstalling: () => installing,
    begin() {
      if (installing) throw new Error('UPDATE_IN_PROGRESS');
      const id = Symbol(); jobs.add(id); emit();
      return () => { jobs.delete(id); emit(); };
    },
    block() { const id = Symbol(); blockers.add(id); emit(); return () => { blockers.delete(id); emit(); }; },
    lock() {
      if (installing || jobs.size || blockers.size) throw new Error('UPDATE_ACTIVE_WORK');
      installing = true; emit();
      return () => { installing = false; emit(); };
    }
  };
}
export const updateActivity = createActivityGate();
