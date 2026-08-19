import { createContext, useContext, useState, ReactNode } from 'react';

interface TutorialContextType {
  tutorialActive: boolean;
  startTutorial: () => void;
  stopTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType>({
  tutorialActive: false,
  startTutorial: () => {},
  stopTutorial: () => {},
});

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [tutorialActive, setTutorialActive] = useState(false);

  const startTutorial = () => setTutorialActive(true);
  const stopTutorial = () => setTutorialActive(false);

  return (
    <TutorialContext.Provider value={{ tutorialActive, startTutorial, stopTutorial }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorialContext() {
  return useContext(TutorialContext);
}
