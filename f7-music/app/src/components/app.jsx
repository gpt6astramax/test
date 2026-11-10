import React from 'react';

import { f7ready, App, Views, View, Toolbar, ToolbarPane, Link } from 'framework7-react';

import routes from '../js/routes';
import store from '../js/store';

// The root of create-framework7's "tabs" template: four views, each a tab with its own page stack and routing, and a
// tab bar at the bottom. Nothing of the shell is written by hand here; status bar, safe areas, the bars and the swipe
// back are all Framework7's.
const MyApp = () => {
  // Framework7 Parameters
  const f7params = {
    name: 'F7 音乐', // App name
    theme: 'auto', // Automatic theme detection
    darkMode: false, // starts light; the switch is on the last tab
    // App store
    store: store,
    // App routes
    routes: routes,
  };

  f7ready(() => {
    // Call F7 APIs here
  });

  return (
    <App {...f7params}>
      {/* Views/Tabs container */}
      <Views tabs className="safe-areas">
        {/* Tabbar for switching views-tabs */}
        <Toolbar tabbar icons bottom>
          <ToolbarPane>
            <Link tabLink="#view-home" tabLinkActive iconF7="compass_fill" text="发现" />
            <Link tabLink="#view-search" iconF7="search" text="搜索" />
            <Link tabLink="#view-library" iconF7="music_albums_fill" text="曲库" />
            <Link tabLink="#view-settings" iconF7="person_fill" text="我的" />
          </ToolbarPane>
        </Toolbar>

        {/* Your main view/tab, should have "view-main" class. It also has "tabActive" prop */}
        <View id="view-home" main tab tabActive url="/" />

        {/* Search View */}
        <View id="view-search" name="search" tab url="/search/" />

        {/* Library View */}
        <View id="view-library" name="library" tab url="/library/" />

        {/* Settings View */}
        <View id="view-settings" name="settings" tab url="/settings/" />
      </Views>
    </App>
  );
};

export default MyApp;
