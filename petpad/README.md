# PetPad concept page

A concept landing page for a pet coin launch pad, with a hibernation-cave theme and 40 pixel bears.
Everything on it is sample data. It is served by the CatHouse server at `/petpad`.

- `template.html` the page
- `bear_art.js` the bear generator (32x32 pixels, 8 coats, 6 eye styles, hats and extras, 6 rooms)
- `build.js` draws the 40 sample bears into the template and writes `index.html`
- `samples/` a cat and a frog picture used on the collections row

```
node petpad/build.js
```

The generated `index.html` is committed so the server needs no build step.
