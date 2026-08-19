import { useState } from 'react';

export function useTutorial() {
  const [active, setActive] = useState(false);

  const start = () => setActive(true);
  const stop = () => setActive(false);
  const isDone = () => localStorage.getItem('vitalis_tutorial_done') === '1';

  return { active, start, stop, isDone };
}
