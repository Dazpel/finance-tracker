import { useState, useEffect } from 'react';

export const useWindowHeight = () => {
  const [windowHeight, setWindowHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowHeight;
}