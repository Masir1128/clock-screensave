#!/usr/bin/env node
// Generates assets/icon.png (512×512) using only Node.js built-ins.
// Run: node scripts/gen-icon.js

const fs = require('fs')
const path = require('path')
let createCanvas = null
try { createCanvas = require('canvas').createCanvas } catch {}

if (!createCanvas) {
  writePNG()
} else {
  writeViaCanvas()
}

function writeViaCanvas() {
  const SIZE = 512
  const canvas = createCanvas(SIZE, SIZE)
  const ctx = canvas.getContext('2d')
  renderIcon(ctx, SIZE)
  const buf = canvas.toBuffer('image/png')
  const out = path.join(__dirname, '..', 'assets', 'icon.png')
  fs.writeFileSync(out, buf)
  console.log('✓ assets/icon.png written via canvas package (' + buf.length + ' bytes)')
}

function renderIcon(ctx, SIZE) {
  const cx = SIZE / 2, cy = SIZE / 2
  const R = SIZE * 0.34
  const lw = SIZE * 0.055

  // Background
  ctx.fillStyle = '#0d0d1a'
  ctx.beginPath()
  ctx.roundRect(0, 0, SIZE, SIZE, SIZE * 0.2)
  ctx.fill()

  // Glow
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, SIZE * 0.5)
  glow.addColorStop(0, 'rgba(110,231,247,0.18)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Clock ring
  ctx.strokeStyle = 'white'
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()

  // Hour dots
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 - Math.PI / 2
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, lw * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.lineCap = 'round'

  // Hour hand (pointing ~10)
  const hA = (10 / 12) * Math.PI * 2 - Math.PI / 2
  ctx.strokeStyle = 'white'
  ctx.lineWidth = lw * 1.3
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(hA) * R * 0.52, cy + Math.sin(hA) * R * 0.52)
  ctx.stroke()

  // Minute hand (pointing ~10)
  const mA = (10 / 60) * Math.PI * 2 - Math.PI / 2
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(mA) * R * 0.73, cy + Math.sin(mA) * R * 0.73)
  ctx.stroke()

  // Center dot
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(cx, cy, lw * 0.8, 0, Math.PI * 2)
  ctx.fill()
}

// ── Pure-Node PNG writer (no dependencies) ──────────────────────────────────
function writePNG() {
  const SIZE = 512
  const pixels = new Uint8Array(SIZE * SIZE * 4) // RGBA

  // Draw into pixels[]
  paintPixels(pixels, SIZE)

  const png = encodePNG(pixels, SIZE, SIZE)
  const out = path.join(__dirname, '..', 'assets', 'icon.png')
  fs.writeFileSync(out, png)
  console.log('✓ assets/icon.png written via pure-Node encoder (' + png.length + ' bytes)')
}

function paintPixels(px, S) {
  const cx = S / 2, cy = S / 2
  const R = S * 0.34, lw = S * 0.055

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = (y * S + x) * 4
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      const r = cornerRadius(x, y, S, S, S * 0.2)

      // Default: transparent
      px[idx + 3] = 0

      if (!r) continue // outside rounded rect

      // Background
      px[idx] = 13; px[idx+1] = 13; px[idx+2] = 26; px[idx+3] = 255

      // Subtle radial glow
      const gf = Math.max(0, 1 - dist / (S * 0.5))
      const g = Math.round(gf * gf * 18)
      px[idx] = Math.min(255, px[idx] + g + 4)
      px[idx+1] = Math.min(255, px[idx+1] + g + 9)
      px[idx+2] = Math.min(255, px[idx+2] + g + 6)

      // Clock ring
      const ringD = Math.abs(dist - R)
      if (ringD < lw / 2) {
        const alpha = Math.max(0, 1 - ringD / (lw / 2))
        blend(px, idx, 255, 255, 255, alpha)
        continue
      }

      // Hour dots
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 - Math.PI / 2
        const hx = cx + Math.cos(a) * R * 0.8
        const hy = cy + Math.sin(a) * R * 0.8
        const dd = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2)
        if (dd < lw * 0.6) { blend(px, idx, 255, 255, 255, 1); break }
      }

      // Hour hand
      if (onSegment(x, y, cx, cy,
          cx + Math.cos((10/12)*Math.PI*2 - Math.PI/2) * R * 0.52,
          cy + Math.sin((10/12)*Math.PI*2 - Math.PI/2) * R * 0.52,
          lw * 1.3 / 2)) blend(px, idx, 255, 255, 255, 1)

      // Minute hand
      if (onSegment(x, y, cx, cy,
          cx + Math.cos((10/60)*Math.PI*2 - Math.PI/2) * R * 0.73,
          cy + Math.sin((10/60)*Math.PI*2 - Math.PI/2) * R * 0.73,
          lw / 2)) blend(px, idx, 255, 255, 255, 1)

      // Center dot
      if (dist < lw * 0.8) blend(px, idx, 255, 255, 255, 1)
    }
  }
}

function blend(px, idx, r, g, b, a) {
  if (a <= 0) return
  if (a >= 1) { px[idx]=r; px[idx+1]=g; px[idx+2]=b; return }
  px[idx]   = Math.round(px[idx]   * (1-a) + r * a)
  px[idx+1] = Math.round(px[idx+1] * (1-a) + g * a)
  px[idx+2] = Math.round(px[idx+2] * (1-a) + b * a)
}

function cornerRadius(x, y, W, H, r) {
  // Returns true if (x,y) is inside rounded rect
  const cx1 = r, cy1 = r, cx2 = W - r, cy2 = H - r
  if (x < 0 || y < 0 || x >= W || y >= H) return false
  if (x < r && y < r) return (x-cx1)**2 + (y-cy1)**2 <= r*r
  if (x > cx2 && y < r) return (x-cx2)**2 + (y-cy1)**2 <= r*r
  if (x < r && y > cy2) return (x-cx1)**2 + (y-cy2)**2 <= r*r
  if (x > cx2 && y > cy2) return (x-cx2)**2 + (y-cy2)**2 <= r*r
  return true
}

function onSegment(px, py, x1, y1, x2, y2, half) {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx*dx + dy*dy
  if (len2 === 0) return Math.hypot(px-x1, py-y1) < half
  let t = ((px-x1)*dx + (py-y1)*dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1+t*dx), py - (y1+t*dy)) < half
}

// ── Minimal PNG encoder ──────────────────────────────────────────────────────
function encodePNG(rgba, w, h) {
  const zlib = require('zlib')

  // Raw image data: filter byte (0 = None) + scanline
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0 // filter type None
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4
      const dst = y * (1 + w * 4) + 1 + x * 4
      raw[dst]   = rgba[src]
      raw[dst+1] = rgba[src+1]
      raw[dst+2] = rgba[src+2]
      raw[dst+3] = rgba[src+3]
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 })

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const t = Buffer.from(type)
    const crc = crc32(Buffer.concat([t, data]))
    const c = Buffer.alloc(4); c.writeInt32BE(crc)
    return Buffer.concat([len, t, data, c])
  }

  const IHDR_data = Buffer.alloc(13)
  IHDR_data.writeUInt32BE(w, 0)
  IHDR_data.writeUInt32BE(h, 4)
  IHDR_data[8] = 8  // bit depth
  IHDR_data[9] = 6  // color type RGBA
  // compression, filter, interlace = 0

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), // PNG signature
    chunk('IHDR', IHDR_data),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const b of buf) {
    crc ^= b
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
  }
  return (crc ^ 0xFFFFFFFF) | 0
}
