import { useEffect } from 'react';

const usePreventNavigation = (canPreventNav: boolean) => {
  const warningText = 'You have unsaved changes. Are you sure you want to leave this page?';

  useEffect(() => {
    const handleWindowClose = (e: BeforeUnloadEvent) => {
      if (!canPreventNav) return;
      e.preventDefault();
      e.returnValue = warningText;
    };

    const handlePopState = (e: PopStateEvent) => {
      if (canPreventNav) {
        const confirmLeave = window.confirm(warningText);
        if (!confirmLeave) {
          // Push the current state back to prevent navigation
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    window.addEventListener('beforeunload', handleWindowClose);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleWindowClose);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [canPreventNav]);
};

export default usePreventNavigation;