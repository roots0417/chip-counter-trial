(() => {
  // barcode.js
  var library;
  async function barcodeLibrary() {
    if (!library) library = new Promise((resolve, reject) => {
      if (globalThis.ZXing) return resolve(globalThis.ZXing);
      const script = document.createElement("script");
      script.src = "vendor/zxing.min.js?v=13";
      script.onload = () => resolve(globalThis.ZXing);
      script.onerror = () => {
        library = null;
        script.remove();
        reject(new Error("\uBC14\uCF54\uB4DC \uC77D\uAE30 \uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68\uD558\uC138\uC694."));
      };
      document.head.append(script);
    });
    return library;
  }
  async function decodeOne(image) {
    const z = await barcodeLibrary(), hints = /* @__PURE__ */ new Map();
    hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.QR_CODE, z.BarcodeFormat.DATA_MATRIX, z.BarcodeFormat.AZTEC, z.BarcodeFormat.PDF_417]);
    hints.set(z.DecodeHintType.TRY_HARDER, true);
    const reader = new z.MultiFormatReader();
    reader.setHints(hints);
    const { data, width, height } = image, luma = new Uint8ClampedArray(width * height);
    for (let i = 0; i < luma.length; i++) {
      const n = i * 4;
      luma[i] = (data[n] + 2 * data[n + 1] + data[n + 2]) / 4;
    }
    const source = new z.RGBLuminanceSource(luma, width, height);
    const rotated = new Uint8ClampedArray(luma.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rotated[x * height + height - 1 - y] = luma[y * width + x];
    const turned = new z.RGBLuminanceSource(rotated, height, width);
    for (const [src, rotated2] of [[source, false], [source.invert(), false], [turned, true], [turned.invert(), true]]) try {
      const result = reader.decodeWithState(new z.BinaryBitmap(new z.HybridBinarizer(src))), points = result.getResultPoints().map((p) => rotated2 ? { x: p.getY(), y: height - 1 - p.getX() } : { x: p.getX(), y: p.getY() });
      return { text: result.getText(), points };
    } catch (e) {
      if (!["NotFoundException", "ChecksumException", "FormatException"].includes(e.constructor.name) && !(e instanceof z.NotFoundException) && !(e instanceof z.ChecksumException) && !(e instanceof z.FormatException)) throw e;
    } finally {
      reader.reset();
    }
    return null;
  }
  function barcodeRect(image, points) {
    let left = Math.min(...points.map((p) => p.x)), right = Math.max(...points.map((p) => p.x)), top = Math.min(...points.map((p) => p.y)), bottom = Math.max(...points.map((p) => p.y));
    const gray = (x, y) => {
      x = Math.max(0, Math.min(image.width - 1, Math.round(x)));
      y = Math.max(0, Math.min(image.height - 1, Math.round(y)));
      const i = (y * image.width + x) * 4;
      return (image.data[i] + 2 * image.data[i + 1] + image.data[i + 2]) / 4;
    };
    const horizontal = bottom - top < 3 && right - left > 20, vertical = right - left < 3 && bottom - top > 20;
    if (horizontal || vertical) {
      const low = horizontal ? left : top, high = horizontal ? right : bottom, center = horizontal ? (top + bottom) / 2 : (left + right) / 2, limit = horizontal ? image.height : image.width;
      const line = (position, shift = 0) => Array.from({ length: 96 }, (_, i) => {
        const axis = low + (high - low) * (i + 0.5) / 96 + shift;
        return horizontal ? gray(axis, position) : gray(position, axis);
      });
      const base = line(center), sorted = [...base].sort((a2, b2) => a2 - b2), threshold = (sorted[15] + sorted[80]) / 2, pattern = base.map((v) => v < threshold);
      const matches = (position) => {
        const unit = Math.max(1, (high - low) / 192), extent = (high - low) * 0.08;
        for (let delta = 0; delta <= extent; delta += unit) for (const shift of delta ? [delta, -delta] : [0]) if (line(position, shift).reduce((n, v, i) => n + (v < threshold === pattern[i]), 0) / 96 > 0.83) return true;
        return false;
      };
      let a = Math.round(center), b = a;
      while (a > 0 && matches(a - 1)) a--;
      while (b < limit - 1 && matches(b + 1)) b++;
      if (horizontal) {
        top = a;
        bottom = b;
      } else {
        left = a;
        right = b;
      }
    }
    const pad = 3;
    return { left: Math.max(0, Math.floor(left) - pad), right: Math.min(image.width, Math.ceil(right) + pad), top: Math.max(0, Math.floor(top) - pad), bottom: Math.min(image.height, Math.ceil(bottom) + pad) };
  }
  function connectedBars(image, a, b) {
    const sharedX = Math.min(a.right, b.right) - Math.max(a.left, b.left), sharedY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const horizontal = sharedX > 0.85 * Math.min(a.right - a.left, b.right - b.left) && Math.max(a.right - a.left, b.right - b.left) > 3 * Math.min(a.bottom - a.top, b.bottom - b.top);
    const vertical = sharedY > 0.85 * Math.min(a.bottom - a.top, b.bottom - b.top) && Math.max(a.bottom - a.top, b.bottom - b.top) > 3 * Math.min(a.right - a.left, b.right - b.left);
    if (!horizontal && !vertical) return false;
    const start = horizontal ? Math.min((a.top + a.bottom) / 2, (b.top + b.bottom) / 2) : Math.min((a.left + a.right) / 2, (b.left + b.right) / 2), end = horizontal ? Math.max((a.top + a.bottom) / 2, (b.top + b.bottom) / 2) : Math.max((a.left + a.right) / 2, (b.left + b.right) / 2), lo = horizontal ? Math.max(a.left, b.left) : Math.max(a.top, b.top), hi = horizontal ? Math.min(a.right, b.right) : Math.min(a.bottom, b.bottom);
    let quiet = 0;
    for (let t = Math.ceil(start); t <= end; t++) {
      let min = 255, max = 0;
      for (let k = 0; k < 64; k++) {
        const axis = lo + (hi - lo) * (k + 0.5) / 64, x = Math.max(0, Math.min(image.width - 1, Math.round(horizontal ? axis : t))), y = Math.max(0, Math.min(image.height - 1, Math.round(horizontal ? t : axis))), n = (y * image.width + x) * 4, v = (image.data[n] + 2 * image.data[n + 1] + image.data[n + 2]) / 4;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      quiet = max - min < 40 ? quiet + 1 : 0;
      if (quiet >= 2) return false;
    }
    return true;
  }
  async function decodeBarcodes(image) {
    const first = await decodeOne(image);
    if (!first) return [];
    const rootRect = barcodeRect(image, first.points), found = [{ text: first.text, rect: rootRect }];
    const clean = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
    const erase = (rect) => {
      const px = Math.max(8, Math.round((rect.right - rect.left) * 0.06)), py = Math.max(8, Math.round((rect.bottom - rect.top) * 0.06));
      for (let y = Math.max(0, rect.top - py); y < Math.min(image.height, rect.bottom + py); y++) for (let x = Math.max(0, rect.left - px); x < Math.min(image.width, rect.right + px); x++) {
        const n = (y * image.width + x) * 4;
        clean.data[n] = clean.data[n + 1] = clean.data[n + 2] = 255;
        clean.data[n + 3] = 255;
      }
    };
    erase(rootRect);
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await decodeOne(clean);
      if (!result) break;
      const rect = barcodeRect(clean, result.points);
      const duplicate = found.some((old) => {
        if (old.text !== result.text) return false;
        const overlap = Math.max(0, Math.min(old.rect.right, rect.right) - Math.max(old.rect.left, rect.left)) * Math.max(0, Math.min(old.rect.bottom, rect.bottom) - Math.max(old.rect.top, rect.top));
        const area = Math.min((old.rect.right - old.rect.left) * (old.rect.bottom - old.rect.top), (rect.right - rect.left) * (rect.bottom - rect.top));
        return overlap > area * 0.25 || connectedBars(image, old.rect, rect);
      });
      if (!duplicate) {
        found.push({ text: result.text, rect });
        return found;
      }
      erase(rect);
    }
    return found;
  }

  // android/barcode-worker-entry.js
  self.globalThis = self;
  importScripts("vendor/zxing.min.js?v=13");
  self.onmessage = async (e) => {
    const { id, image } = e.data;
    try {
      self.postMessage({ id, codes: await decodeBarcodes(image) });
    } catch (error) {
      self.postMessage({ id, error: error.message || "\uBC14\uCF54\uB4DC \uBD84\uC11D \uC624\uB958" });
    }
  };
})();
