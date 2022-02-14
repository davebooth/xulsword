/* eslint-disable prettier/prettier */
import React from 'react';
import i18n from 'i18next';
import renderToRoot from '../rinit';
import { Hbox, Vbox } from '../libxul/boxes';
import Label from '../libxul/label';
import Stack from '../libxul/stack';
import '../about/about.css';

renderToRoot(
  <Vbox id="mainbox" flex="1">
    <Stack flex="1">
      <Vbox id="layer1" flex="1" width="500" height="375" />
      <Vbox id="layer2" flex="1" width="500" height="375" pack="end">
        <Hbox align="center">
          <Vbox flex="1" pack="start" align="center">
            <Label className="splash-text" value={i18n.t('producedBy')} />
          </Vbox>
        </Hbox>
      </Vbox>
    </Stack>
  </Vbox>);
