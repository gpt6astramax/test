// Navigation inside one tab: nav.push(name, params), nav.pop(), nav.popToRoot(). Provided by DepthStackView.
import * as React from 'react';

export const NavContext = React.createContext(null);
export const useNav = () => React.useContext(NavContext);
