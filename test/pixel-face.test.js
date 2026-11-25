const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createPage(reduceMotion = false) {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const pixels = new Map();
  const context = {
    fillStyle: '',
    clearRect() { pixels.clear(); },
    fillRect(x, y) { pixels.set(`${x},${y}`, this.fillStyle); }
  };
  const canvas = {
    attributes: {},
    getContext() { return context; },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const buttons = ['happy', 'excited', 'sad', 'surprised', 'sleepy'].map((expression) => ({
    dataset: { expression },
    attributes: {},
    addEventListener(type, handler) { this.click = handler; },
    setAttribute(name, value) { this.attributes[name] = value; }
  }));
  const status = { textContent: '' };
  const media = {
    matches: reduceMotion,
    addEventListener(type, handler) { this.change = handler; }
  };
  const timers = new Map();
  let nextTimer = 0;
  const window = {
    matchMedia() { return media; },
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); }
  };
  const document = {
    querySelector(selector) { return selector === '#face' ? canvas : status; },
    querySelectorAll() { return buttons; }
  };
  vm.runInNewContext(script, { document, window });
  return {
    buttons, canvas, status, media, timers,
    frame: () => JSON.stringify([...pixels.entries()].sort()),
    tick: () => [...timers.values()].forEach((callback) => callback())
  };
}

test('all five expressions remain distinct and animate after selection', () => {
  const page = createPage();
  const faces = new Set();
  for (const button of page.buttons) {
    button.click();
    const closed = page.frame();
    faces.add(closed);
    page.tick();
    assert.notEqual(page.frame(), closed, button.dataset.expression);
    assert.equal(page.timers.size, 1);
    assert.equal(page.buttons.filter((item) => item.attributes['aria-pressed'] === 'true').length, 1);
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.match(page.canvas.attributes['aria-label'], /16×16ドット絵/);
    assert.match(page.status.textContent, /を選択中/);
  }
  assert.equal(faces.size, 5);
});

test('open eyes blink without stopping the talking animation', () => {
  const page = createPage();
  for (const expression of ['excited', 'sad', 'surprised']) {
    page.buttons.find((button) => button.dataset.expression === expression).click();
    for (let i = 0; i < 6; i++) page.tick();
    const openEyes = page.frame();
    page.tick();
    page.tick();
    assert.notEqual(page.frame(), openEyes, expression);
    page.tick();
    const openMouth = page.frame();
    page.tick();
    assert.notEqual(page.frame(), openMouth, expression);
  }
});

test('reduced motion stops animation and resumes when the preference changes', () => {
  const page = createPage(true);
  assert.equal(page.timers.size, 0);
  page.buttons[2].click();
  const still = page.frame();
  page.tick();
  assert.equal(page.frame(), still);
  page.media.matches = false;
  page.media.change();
  assert.equal(page.timers.size, 1);
  page.tick();
  assert.notEqual(page.frame(), still);
  page.media.matches = true;
  page.media.change();
  assert.equal(page.timers.size, 0);
  assert.equal(page.frame(), still);
});
