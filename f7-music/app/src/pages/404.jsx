import React from 'react';
import { Page, Navbar, Block } from 'framework7-react';

const NotFoundPage = () => (
  <Page>
    <Navbar title="找不到页面" backLink="返回" />
    <Block strong inset>
      <p>这个页面不存在。</p>
    </Block>
  </Page>
);

export default NotFoundPage;
