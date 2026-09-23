// Activity acquisition stays synchronous so updater safety checks cannot race with new work.
// React-facing subscriber notifications are deferred to a microtask to avoid nested updates
// when activity begins from layout effects, external-store callbacks, or IPC polling.
export function createActivityGate() {
  const jobs = new Set<symbol>();
  const blockers = new Set<symbol>();
  const listeners = new Set<() => void>();
  let installing = false;
  let notifyScheduled = false;

  const emit = () => {
    if (notifyScheduled) return;
    notifyScheduled = true;
    void Promise.resolve().then(() => {
      notifyScheduled = false;
      for (const listener of Array.from(listeners)) listener();
    });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    count: () => jobs.size + blockers.size,
    isInstalling: () => installing,
    begin() {
      if (installing) throw new Error('UPDATE_IN_PROGRESS');
      const id = Symbol();
      jobs.add(id);
      emit();
      return () => {
        if (!jobs.delete(id)) return;
        emit();
      };
    },
    block() {
      const id = Symbol();
      blockers.add(id);
      emit();
      return () => {
        if (!blockers.delete(id)) return;
        emit();
      };
    },
    lock() {
      if (installing || jobs.size || blockers.size) throw new Error('UPDATE_ACTIVE_WORK');
      installing = true;
      emit();
      return () => {
        if (!installing) return;
        installing = false;
        emit();
      };
    }
  };
}

export const updateActivity = createActivityGate();
