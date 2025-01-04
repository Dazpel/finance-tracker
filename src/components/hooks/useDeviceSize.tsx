import { useState, useEffect } from "react";

export const useDeviceSize = () => {
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const isMobileOrTabletSize = window.innerWidth <= 768;
      setIsMobileOrTablet(isMobileOrTabletSize);
    };

    // Call the function on mount to check the initial size
    handleResize();

    // Add event listener to monitor resize events
    window.addEventListener("resize", handleResize);

    // Cleanup the event listener when the component is unmounted
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobileOrTablet;
}
