# Shelf Counter v3.1

If ZXing fails to load from CDNs on your network, you can **self-host** it:

1. Create a folder `zxing/` next to `index.html`.
2. Download `index.min.js` from https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.4/umd/index.min.js
3. Save it as `zxing/index.min.js`.
4. Reload the page.

The app will try jsDelivr → unpkg → local `/zxing/index.min.js` in that order.
