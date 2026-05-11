/* Shared chessboard.js board config. SVG pieces stay crisp at any resolution. */

// cburnett piece set (Lichess) via jsDelivr CDN — clean line-art SVGs, well cached.
export const PIECE_THEME =
    'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/{piece}.svg';

// Snappier animations than chessboard.js defaults.
export const ANIM = {
    moveSpeed: 140,
    snapbackSpeed: 70,
    snapSpeed: 30,
    appearSpeed: 100,
    trashSpeed: 100,
};
