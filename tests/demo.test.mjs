import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../src.js', import.meta.url), 'utf8');
const workspaceSource=readFileSync(new URL('../workspace.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('injectSpeedInsights();','');
function app(route = '/admin') {
  const dom = new JSDOM('<div id="app"></div>', { url: `http://localhost/#${route}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true });
  window.BroadcastChannel = undefined;
  window.eval(source);
  return window;
}

test('landing ticker has identical long halves for a seamless loop',()=>{
  const w=app('/');
  const groups=[...w.document.querySelectorAll('.ticker-group')];
  assert.equal(groups.length,2);
  assert.equal(groups[0].textContent,groups[1].textContent);
  assert.ok(groups[0].textContent.match(/KOSHARY/g).length>=4);
  w.close();
});

test('Arabic switch translates the public navigation and demo HR has no landing navbar',async()=>{
  const w=app('/');w.eval(workspaceSource);
  w.document.querySelector('#workspace-language').click();
  assert.equal(w.document.documentElement.lang,'ar');
  assert.match(w.document.querySelector('.topbar nav').textContent,/جرّب هادل/);
  await new Promise(resolve=>setTimeout(resolve,0));
  w.close();
  const hr=app('/admin');
  assert.equal(hr.document.querySelector('.topbar nav'),null);
  assert.match(hr.document.querySelector('.topbar .brand').getAttribute('href'),/#\/admin/);
  hr.close();
});

test('HR can add and remove choices within 2–8 limit', () => {
  const w = app();
  const count = () => w.document.querySelectorAll('.option-field').length;
  assert.equal(count(), 4);
  for (let i = 0; i < 5; i++) w.document.querySelector('#add-option').click();
  assert.equal(count(), 8);
  assert.equal(w.document.querySelector('#add-option').disabled, true);
  for (let i = 0; i < 6; i++) w.document.querySelector('.remove-option').click();
  assert.equal(count(), 2);
  assert.equal(w.document.querySelector('.remove-option').disabled, true);
});

test('publishing question and branding updates vote page and resets old votes', () => {
  const w = app();
  const form = w.document.querySelector('#admin-form');
  form.elements.question.value = 'Koshary or hawawshi?';
  form.elements.company.value = 'Cairo Team';
  form.elements.accent.value = '#123456';
  w.document.querySelectorAll('.option-input').forEach((el, i) => { el.value = ['Koshary', 'Hawawshi', 'Both', 'Neither'][i]; });
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const data = JSON.parse(w.localStorage.getItem('huddl-demo-v2'));
  assert.equal(data.question, 'Koshary or hawawshi?');
  assert.equal(data.company, 'Cairo Team');
  assert.equal(data.accent, '#123456');
  assert.equal(data.votes.length, 0);
  w.location.hash = '/vote';
  w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  assert.match(w.document.querySelector('.vote-shell h1').textContent, /Koshary or hawawshi/);
  assert.equal(w.document.querySelectorAll('.vote-option').length, 4);
});

test('Egyptian prompt presets populate question and options', () => {
  const w = app();
  w.document.querySelector('[data-template="1"]').click();
  assert.match(w.document.querySelector('textarea').value, /ordering lunch/);
  assert.equal(w.document.querySelectorAll('.option-field').length, 4);
  assert.match(w.document.querySelector('.option-input').value, /Koshary/);
});

test('logo upload extracts a brand color and saves the logo', async () => {
  const w = app();
  w.URL.createObjectURL = () => 'blob:demo-logo';
  w.URL.revokeObjectURL = () => {};
  w.Image = class { width = 4; height = 4; set src(_) { queueMicrotask(() => this.onload()); } };
  w.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage() {},
    getImageData() { const data = new Uint8ClampedArray(64); data.set([230, 50, 40, 255], 0); return { data }; }
  });
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,TEST';
  const input = w.document.querySelector('#company-logo');
  Object.defineProperty(input, 'files', { value: [{ size: 1000 }] });
  input.dispatchEvent(new w.Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.document.querySelectorAll('.color-swatch').length, 1);
  assert.match(w.document.querySelector('.logo-preview img').src, /TEST/);
  w.document.querySelector('#admin-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const data = JSON.parse(w.localStorage.getItem('huddl-demo-v2'));
  assert.equal(data.logo, 'data:image/png;base64,TEST');
  assert.notEqual(data.accent, '#ef473d');
});
