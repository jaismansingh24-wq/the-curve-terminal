/* The real work behind the loading bar. Each step is something the app
   actually does before the home screen is ready; the bar can lag behind
   them so it can be read, but never shows more than has really finished. */

export function createLoader(steps) {
  const state = {
    total: steps.length,
    done: 0,
    finished: false,
    labels: steps.map((s) => s.label),
    notes: {},
  };

  /* a step that hangs must not hold the app hostage: each gets a ceiling */
  const guard = (p, ms) => Promise.race([
    Promise.resolve().then(p),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);

  state.promise = (async () => {
    for (const step of steps) {
      try {
        const r = await guard(step.run, step.limit || 3000);
        if (r === 'timeout') state.notes[step.id] = 'timeout';
      } catch (e) {
        state.notes[step.id] = 'failed';
      }
      state.done += 1;
    }
    state.finished = true;
    return state;
  })();

  return state;
}
