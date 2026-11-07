// The signet (#2705): a small heraldic shield drawn from a player's public key,
// the same on every client. Ported from the "C. Shield" mockup in
// scripts/assets/identity-signets.mjs (#2662). Dark ground, light ink, so it
// reads by lightness alone.
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const EDGE = "#0b0f14";
const DARK = ["#1b2a4a", "#5a1f2e", "#1f4a38", "#4a3a6a"] as const;
const LIGHT = ["#f2d64b", "#ffffff", "#7fe3ff", "#ff9f43"] as const;
const CHARGE_COLOURS = ["#f2d64b", "#ffffff"] as const;

const OUTLINES = [
  "M-10 -11 H10 V3 Q10 9 0 12 Q-10 9 -10 3z",
  "M-10 -11 H10 V0 L0 12 L-10 0z",
  "M-10 -9 Q0 -13 10 -9 V4 Q10 9 0 12 Q-10 9 -10 4z",
  "M-10 -11 H10 V6 L0 12 L-10 6z",
] as const;

export interface SignetParams {
  /** Shield outline, 0-3. */
  readonly shape: number;
  /** How the ink divides the field, 0-7. */
  readonly division: number;
  /** Index into the four dark grounds. */
  readonly ground: number;
  /** Index into the four light inks. */
  readonly ink: number;
  /** Charge in the middle, 0-7 (0 is none). */
  readonly charge: number;
  /** 0 gold, 1 white. */
  readonly chargeColour: number;
}

/** The first 4 bytes, big-endian, of HKDF-SHA256(pubkey, info "vibewars signet"). */
export function signetWord(pubkeyHex: string): number {
  const okm = hkdf(sha256, hexToBytes(pubkeyHex), undefined, utf8ToBytes("vibewars signet"), 4);
  return (
    ((okm[0] ?? 0) * 2 ** 24 + ((okm[1] ?? 0) << 16) + ((okm[2] ?? 0) << 8) + (okm[3] ?? 0)) >>> 0
  );
}

/** Unpacks the low 13 bits of a word, least significant first. */
export function signetParams(word: number): SignetParams {
  let at = 0;
  const take = (n: number): number => {
    const v = (word >>> at) & ((1 << n) - 1);
    at += n;
    return v;
  };
  const shape = take(2);
  const division = take(3);
  const ground = take(2);
  const ink = take(2);
  const charge = take(3);
  const chargeColour = take(1);
  return { shape, division, ground, ink, charge, chargeColour };
}

/** The 13 bits `signetParams` reads, back into a word. */
export function signetBits(p: SignetParams): number {
  return (
    p.shape |
    (p.division << 2) |
    (p.ground << 5) |
    (p.ink << 7) |
    (p.charge << 9) |
    (p.chargeColour << 12)
  );
}

function divisionSvg(division: number, ink: string): string {
  const f = `fill="${ink}"`;
  return (
    [
      "",
      `<rect x="0" y="-12" width="12" height="26" ${f}/>`,
      `<rect x="-12" y="-1" width="24" height="14" ${f}/>`,
      `<path d="M-12 -12 L12 -12 L12 -4 L-12 8z" ${f}/>`,
      `<path d="M-12 -12 L0 -2 L12 -12 V-5 L0 5 L-12 -5z" ${f}/>`,
      `<path d="M-2.2 -12 H2.2 V-2.2 H12 V2.2 H2.2 V14 H-2.2 V2.2 H-12 V-2.2 H-2.2z" ${f}/>`,
      `<path d="M-12 -9 L-9 -12 L12 9 L9 12z M12 -9 L9 -12 L-12 9 L-9 12z" ${f}/>`,
      `<rect x="-12" y="-12" width="12" height="12" ${f}/><rect x="0" y="0" width="12" height="14" ${f}/>`,
    ][division] ?? ""
  );
}

function chargeSvg(charge: number, c: string): string {
  const edge = `stroke="${EDGE}" stroke-width="0.8"`;
  const join = `${edge} stroke-linejoin="round"`;
  return (
    [
      "",
      `<circle cy="-1" r="2.6" fill="${c}" ${edge}/>`,
      `<path d="M0 -6 L1.8 -1.6 L6 -1.4 L2.6 1.4 L3.8 6 L0 3.4 L-3.8 6 L-2.6 1.4 L-6 -1.4 L-1.8 -1.6z" fill="${c}" ${join}/>`,
      `<circle cy="-1" r="3.6" fill="none" stroke="${EDGE}" stroke-width="3"/><circle cy="-1" r="3.6" fill="none" stroke="${c}" stroke-width="1.6"/>`,
      `<rect x="-5" y="-2.2" width="10" height="3.6" fill="${c}" ${edge}/>`,
      `<path d="M0 -6 L5 3 L-5 3z" fill="${c}" ${join}/>`,
      `<path d="M0 -6 L4.4 -1 L0 4 L-4.4 -1z" fill="${c}" ${join}/>`,
      `<path d="M3.4 -5 A6 6 0 1 0 3.4 4 A4.4 4.4 0 1 1 3.4 -5z" fill="${c}" ${edge}/>`,
    ][charge] ?? ""
  );
}

/** A self-contained SVG, `size` px square. */
export function signetSvg(p: SignetParams, size: number): string {
  const outline = OUTLINES[p.shape] ?? OUTLINES[0];
  const ground = DARK[p.ground] ?? DARK[0];
  const ink = LIGHT[p.ink] ?? LIGHT[0];
  const charge = CHARGE_COLOURS[p.chargeColour] ?? CHARGE_COLOURS[0];
  const id = `sg${String(signetBits(p))}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="-13 -14 26 28">` +
    `<clipPath id="${id}"><path d="${outline}"/></clipPath>` +
    `<path d="${outline}" fill="${ground}"/>` +
    `<g clip-path="url(#${id})">${divisionSvg(p.division, ink)}</g>` +
    `<path d="${outline}" fill="none" stroke="${EDGE}" stroke-width="2.4"/>` +
    `<path d="${outline}" fill="none" stroke="${ink}" stroke-width="1"/>` +
    chargeSvg(p.charge, charge) +
    `</svg>`
  );
}
