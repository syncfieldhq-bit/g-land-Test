// =============================================================
// qr.js - QRコード自前実装（軽量・外部依存ゼロ）
// QR Model 2, Version 1-10, Level L
// Based on QR Code Specification (ISO/IEC 18004)
// =============================================================

// ガロア体 GF(256) の対数表
const EXP_TABLE = new Array(256);
const LOG_TABLE = new Array(256);
(function initGF() {
  for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

// Reed-Solomon符号の生成多項式
function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const newPoly = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= poly[j];
      newPoly[j + 1] ^= gfMul(poly[j], EXP_TABLE[i]);
    }
    poly = newPoly;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const gen = rsGenPoly(ecCount);
  const result = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = result[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        result[i + j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return result.slice(data.length);
}

// QR Version 5 (37x37) Level L のスペック簡略版
// データ容量: 108 codewords, EC: 26 codewords
// ※ ここでは「短い文字列専用」の簡易実装としてVersion 5固定
const VERSION = 5;
const SIZE = 17 + 4 * VERSION; // 37
const DATA_BYTES = 108;
const EC_BYTES = 26;

// 文字列 → バイト配列（UTF-8）
function toUTF8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xC0 | (c >> 6));
      bytes.push(0x80 | (c & 0x3F));
    } else {
      bytes.push(0xE0 | (c >> 12));
      bytes.push(0x80 | ((c >> 6) & 0x3F));
      bytes.push(0x80 | (c & 0x3F));
    }
  }
  return bytes;
}

// ビット列 → バイト配列
function bitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8 && i + j < bits.length; j++) {
      if (bits[i + j]) b |= (1 << (7 - j));
    }
    bytes.push(b);
  }
  return bytes;
}

function intToBits(n, len) {
  const bits = [];
  for (let i = len - 1; i >= 0; i--) bits.push((n >> i) & 1);
  return bits;
}

// データエンコード（バイトモード）
function encodeData(text) {
  const data = toUTF8Bytes(text);
  if (data.length > DATA_BYTES - 3) {
    throw new Error('QR: データが長すぎます（最大' + (DATA_BYTES - 3) + 'バイト）');
  }
  let bits = [];
  bits = bits.concat(intToBits(0b0100, 4)); // バイトモード
  bits = bits.concat(intToBits(data.length, 8)); // 文字数（Version 1-9）
  for (const b of data) bits = bits.concat(intToBits(b, 8));
  bits = bits.concat(intToBits(0, 4)); // 終端
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes = bitsToBytes(bits);
  // パディング
  const pads = [0xEC, 0x11];
  while (bytes.length < DATA_BYTES) bytes.push(pads[bytes.length % 2]);
  return bytes;
}

// マトリクス初期化
function createMatrix(size) {
  const m = [];
  for (let i = 0; i < size; i++) {
    m.push(new Array(size).fill(null));
  }
  return m;
}

// ファインダーパターン配置
function placeFinder(m, r, c) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
      if ((dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
          (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)) {
        m[rr][cc] = 1;
      } else {
        m[rr][cc] = 0;
      }
    }
  }
}

// アライメントパターン（Version 5 は (6,6),(6,30),(30,6),(30,30)）
function placeAlignment(m) {
  const positions = [6, 30];
  for (const r of positions) {
    for (const c of positions) {
      // ファインダーと重なる場合スキップ
      if ((r === 6 && c === 6) || (r === 6 && c === 30) || (r === 30 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
            m[rr][cc] = 1;
          } else {
            m[rr][cc] = 0;
          }
        }
      }
    }
  }
}

// タイミングパターン
function placeTiming(m) {
  for (let i = 8; i < SIZE - 8; i++) {
    if (m[6][i] === null) m[6][i] = (i % 2 === 0) ? 1 : 0;
    if (m[i][6] === null) m[i][6] = (i % 2 === 0) ? 1 : 0;
  }
}

// フォーマット情報配置（Level L, Mask 0）
function placeFormat(m) {
  // Level L (01) + Mask 0 (000) = 01000
  // BCH(15,5) 後: 111011111000100
  const formatBits = [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0];
  for (let i = 0; i < 6; i++) m[i][8] = formatBits[i];
  m[7][8] = formatBits[6];
  m[8][8] = formatBits[7];
  m[8][7] = formatBits[8];
  for (let i = 0; i < 6; i++) m[8][5 - i] = formatBits[9 + i];

  for (let i = 0; i < 7; i++) m[SIZE - 1 - i][8] = formatBits[i];
  for (let i = 0; i < 8; i++) m[8][SIZE - 8 + i] = formatBits[7 + i];

  m[SIZE - 8][8] = 1; // ダークモジュール
}

// バージョン情報（Version 7以上）→ Version 5なので不要

// ビット配置（ジグザグ）
function placeData(m, bits) {
  let idx = 0;
  let dir = -1; // 上向き
  let col = SIZE - 1;
  while (col > 0) {
    if (col === 6) col--;
    let row = (dir === -1) ? SIZE - 1 : 0;
    while (row >= 0 && row < SIZE) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (m[row][cc] === null) {
          const bit = idx < bits.length ? bits[idx++] : 0;
          // マスク 0: (r+c) % 2 == 0
          const masked = ((row + cc) % 2 === 0) ? (1 - bit) : bit;
          m[row][cc] = masked;
        }
      }
      row += dir;
    }
    dir = -dir;
    col -= 2;
  }
}

// メイン: テキスト → SVG文字列
export function generateQR(text, options = {}) {
  const scale = options.scale || 8;
  const margin = options.margin || 4;
  const fg = options.fg || '#000000';
  const bg = options.bg || '#ffffff';

  // 1. データエンコード
  const dataBytes = encodeData(text);
  // 2. EC計算
  const ecBytes = rsEncode(dataBytes, EC_BYTES);
  const allBytes = dataBytes.concat(ecBytes);
  // 3. バイト→ビット列
  const bits = [];
  for (const b of allBytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }

  // 4. マトリクス組み立て
  const m = createMatrix(SIZE);
  placeFinder(m, 0, 0);
  placeFinder(m, 0, SIZE - 7);
  placeFinder(m, SIZE - 7, 0);
  // ファインダー周辺の空白
  for (let i = 0; i < 8; i++) {
    if (m[7][i] === null) m[7][i] = 0;
    if (m[i][7] === null) m[i][7] = 0;
    if (m[7][SIZE - 1 - i] === null) m[7][SIZE - 1 - i] = 0;
    if (m[i][SIZE - 8] === null) m[i][SIZE - 8] = 0;
    if (m[SIZE - 8][i] === null) m[SIZE - 8][i] = 0;
    if (m[SIZE - 1 - i][7] === null) m[SIZE - 1 - i][7] = 0;
  }
  placeAlignment(m);
  placeTiming(m);
  placeFormat(m);
  placeData(m, bits);

  // 5. SVG生成
  const fullSize = (SIZE + 2 * margin) * scale;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullSize}" height="${fullSize}" viewBox="0 0 ${SIZE + 2 * margin} ${SIZE + 2 * margin}" shape-rendering="crispEdges">`;
  svg += `<rect width="100%" height="100%" fill="${bg}"/>`;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (m[r][c] === 1) {
        svg += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${fg}"/>`;
      }
    }
  }
  svg += '</svg>';
  return svg;
}

// 短い文字列向けのフォールバック（Google Charts風画像URLも提供）
export function generateQRImageURL(text, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}
