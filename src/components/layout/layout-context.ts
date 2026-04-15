import {createContext, useContext} from 'react';

interface SidebarContext {
   sidebarOpen: boolean;
   toggleSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContext>({
   sidebarOpen: false,
   toggleSidebar: () => {},
});

export const useSidebarContext = () => {
   return useContext(SidebarContext);
};
