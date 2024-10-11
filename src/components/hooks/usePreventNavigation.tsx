import { useEffect } from 'react';

const usePreventNavigation = (canPreventNav: boolean) => {
  const warningText = 'You have unsaved changes. Are you sure you want to leave this page?';

  useEffect(() => {
    const handleWindowClose = (e: BeforeUnloadEvent) => {
      if (!canPreventNav) return;
      e.preventDefault();
      e.returnValue = warningText;
    };

    window.addEventListener('beforeunload', handleWindowClose);

    return () => {
      window.removeEventListener('beforeunload', handleWindowClose);
    };
  }, [canPreventNav]);
};

export default usePreventNavigation;