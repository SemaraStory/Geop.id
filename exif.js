/* ============================================================
   Geop.id — EXIF Parser Engine
   Parser EXIF murni JavaScript — tanpa dependensi eksternal
   Mendukung JPEG dengan APP1 Exif (TIFF little/big endian)
   ============================================================ */
(function (global) {
  'use strict';

  const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

  const IFD_TAGS = {
    0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x0132: 'DateTime',
    0x010e: 'ImageDescription', 0x013b: 'Artist', 0x8298: 'Copyright',
    0x0112: 'Orientation', 0x0100: 'ImageWidth', 0x0101: 'ImageHeight',
    0x8769: 'ExifIFDPointer', 0x8825: 'GPSIFDPointer'
  };

  const EXIF_TAGS = {
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8827: 'ISO',
    0x920a: 'FocalLength', 0xa405: 'FocalLength35mm',
    0x9209: 'Flash', 0xa403: 'WhiteBalance',
    0xa433: 'LensMake', 0xa434: 'LensModel',
    0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension'
  };

  const GPS_TAGS = {
    0x0001: 'LatitudeRef', 0x0002: 'Latitude',
    0x0003: 'LongitudeRef', 0x0004: 'Longitude',
    0x0005: 'AltitudeRef', 0x0006: 'Altitude',
    0x0007: 'TimeStamp', 0x001d: 'DateStamp'
  };

  class Parser {
    constructor(buffer) {
      this.dv = new DataView(buffer);
      this.result = { basic: {}, exif: {}, gps: {} };
      this.le = false;
      this._tiff = 0;
    }

    ascii(off, len) {
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = this.dv.getUint8(off + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    }

    readTagValue(type, count, entryOff, tiff) {
      const size = TYPE_SIZES[type] || 1;
      const total = size * count;
      const le = this.le;
      const dv = this.dv;
      const off = total > 4 ? tiff + this._u32(entryOff + 8) : entryOff + 8;

      const numAt = (o) => {
        try {
          switch (type) {
            case 1: return dv.getUint8(o);
            case 3: return dv.getUint16(o, le);
            case 4: return dv.getUint32(o, le);
            case 5: {
              const n = dv.getUint32(o, le);
              const d = dv.getUint32(o + 4, le);
              return d ? n / d : n;
            }
            case 6: return dv.getInt8(o);
            case 8: return dv.getInt16(o, le);
            case 9: return dv.getInt32(o, le);
            case 10: {
              const n = dv.getInt32(o, le);
              const d = dv.getInt32(o + 4, le);
              return d ? n / d : n;
            }
            case 7: return dv.getUint8(o);
            default: return dv.getUint8(o);
          }
        } catch (e) { return 0; }
      };

      if (type === 2) { // ASCII
        return this.ascii(off, count).replace(/\0+$/g, '').trim();
      }
      if (count === 1) return numAt(off);
      const arr = [];
      for (let i = 0; i < count; i++) arr.push(numAt(off + i * size));
      return arr;
    }

    _u32(o) { return this.dv.getUint32(o, this.le); }

    parseIFD(ifdOff, tagMap, bucket) {
      const dv = this.dv;
      const tiff = this._tiff;
      const le = this.le;
      const pointers = {};
      let n;
      try { n = dv.getUint16(tiff + ifdOff, le); } catch { return pointers; }
      if (n > 500) return pointers; // sanity check
      for (let i = 0; i < n; i++) {
        const e = tiff + ifdOff + 2 + i * 12;
        let tag, type, count;
        try {
          tag = dv.getUint16(e, le);
          type = dv.getUint16(e + 2, le);
          count = dv.getUint32(e + 4, le);
        } catch { break; }
        const name = tagMap[tag];
        if (!name) continue;
        try {
          const val = this.readTagValue(type, count, e, tiff);
          if (name === 'ExifIFDPointer') pointers.exif = val;
          else if (name === 'GPSIFDPointer') pointers.gps = val;
          else bucket[name] = val;
        } catch { /* skip malformed entry */ }
      }
      return pointers;
    }

    parse() {
      const dv = this.dv;
      if (dv.byteLength < 12) return null;
      if (dv.getUint16(0) !== 0xFFD8) return null; // Bukan JPEG
      let off = 2;
      while (off + 4 < dv.byteLength) {
        try {
          if (dv.getUint8(off) !== 0xFF) break;
        } catch { break; }
        const marker = dv.getUint8(off + 1);
        if (marker === 0xDA) break; // SOS: stop parsing
        const len = dv.getUint16(off + 2);
        if (marker === 0xE1) {
          try {
            if (this.ascii(off + 4, 4) === 'Exif' &&
                dv.getUint8(off + 8) === 0 &&
                dv.getUint8(off + 9) === 0) {
              const tiff = off + 10;
              this._tiff = tiff;
              const bo = dv.getUint16(tiff);
              this.le = (bo === 0x4949); // 'II' = little endian
              const magic = dv.getUint16(tiff + 2, this.le);
              if (magic === 42) {
                const ifd0 = dv.getUint32(tiff + 4, this.le);
                const ptr = this.parseIFD(ifd0, IFD_TAGS, this.result.basic);
                if (typeof ptr.exif === 'number') {
                  this.parseIFD(ptr.exif, EXIF_TAGS, this.result.exif);
                }
                if (typeof ptr.gps === 'number') {
                  this.parseIFD(ptr.gps, GPS_TAGS, this.result.gps);
                }
              }
              return this.result;
            }
          } catch { /* continue */ }
        }
        off += 2 + len;
      }
      return null;
    }
  }

  function dmsToDecimal(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 3) return null;
    const v = Number(dms[0]) + Number(dms[1]) / 60 + Number(dms[2]) / 3600;
    if (!isFinite(v)) return null;
    if (v === 0 && Number(dms[0]) === 0 && Number(dms[1]) === 0 && Number(dms[2]) === 0) return null;
    return (ref === 'S' || ref === 'W') ? -v : v;
  }

  const api = {
    parse(buffer) {
      try {
        const p = new Parser(buffer);
        return p.parse();
      } catch (e) { return null; }
    },
    dmsToDecimal: dmsToDecimal
  };

  global.ExifParser = api;
})(window);
