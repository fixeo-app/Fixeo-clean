import assert from 'node:assert/strict';
import test from 'node:test';
import { understandLocally } from '../lib/rafi';

test('RAFI local rules classify common FIXEO needs without AI cost', () => {
  assert.equal(understandLocally({mode:'text',text:'J’ai une fuite sous le lavabo'}).serviceCategory,'Plomberie');
  assert.equal(understandLocally({mode:'text',text:'Ma serrure est bloquée'}).serviceCategory,'Serrurerie');
  assert.equal(understandLocally({mode:'text',text:'La clim ne refroidit plus'}).serviceCategory,'Climatisation');
  assert.equal(understandLocally({mode:'text',text:'Une prise ne fonctionne plus'}).serviceCategory,'Électricité');
});

test('RAFI does not invent a trade for an unknown short need', () => {
  const need=understandLocally({mode:'text',text:'bruit'});
  assert.equal(need.serviceCategory,'Autre');
  assert.equal(need.needsConfirmation,true);
});
