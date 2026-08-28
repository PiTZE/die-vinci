// The 22 Major Arcana, drawn as line art in the game's own idiom.
//
// Stroke, never fill, so a card themes itself from currentColor the way the
// nine polyhedra in wireframe.ts already do. A 48x48 box, 1.25 stroke, round
// caps and joins. Every off-the-shelf tarot set found was fill-based
// silhouettes, and every stroke-based icon library has no tarot in it, so
// there was nothing to take.
export const ART = {
  fool: '<circle cx="24" cy="16" r="6"/><path d="M6 40h13l5-12"/><path d="M33 26l9-6"/><path d="M42 20v7"/>',
  wheel: '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="4"/><path d="M24 9v6M24 33v6M9 24h6M33 24h6M13.4 13.4l4.2 4.2M30.4 30.4l4.2 4.2M34.6 13.4l-4.2 4.2M17.6 30.4l-4.2 4.2"/>',
  justice: '<path d="M24 8v32M12 40h24"/><path d="M9 16h30"/><path d="M9 16l-5 10h10zM39 16l-5 10h10z"/>',
  death: '<path d="M14 8h20M14 40h20"/><path d="M16 8l16 32M32 8L16 40"/><path d="M18 24h12"/>',
  tower: '<path d="M14 40V18h20v22"/><path d="M11 18l13-8 13 8"/><path d="M26 20l-5 9h6l-4 8"/>',
  stars: '<path d="M24 6l4 14 14 4-14 4-4 14-4-14-14-4 14-4z"/>',
  moon: '<path d="M30 8a17 17 0 1 0 10 30A18 18 0 0 1 30 8z"/><circle cx="34" cy="16" r="1.5"/>',
  sun: '<circle cx="24" cy="24" r="9"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M37.5 10.5l-4.2 4.2M14.7 33.3l-4.2 4.2"/>',
  // I. As above so below: the eight over the rod that crosses the table. A real
  // crossing, because two tangent circles read as two circles.
  magician: '<path d="M20 10C15 10 15 18 20 18C25 18 29 10 34 10C39 10 39 18 34 18C29 18 25 10 20 10z"/><path d="M24 18v20"/><path d="M12 31h24"/>',
  priestess: '<path d="M14 10v28M34 10v28"/><path d="M11 10h6M31 10h6"/><path d="M14 18c5 7 15 7 20 0"/><path d="M25 27a5 5 0 1 0 3 9 5.4 5.4 0 0 1-3-9z"/>',
  empress: '<circle cx="24" cy="20" r="8"/><path d="M24 28v13M18 35h12"/><circle cx="17" cy="8" r="1.4"/><circle cx="24" cy="6" r="1.4"/><circle cx="31" cy="8" r="1.4"/>',
  emperor: '<circle cx="20" cy="28" r="9"/><path d="M26.4 21.6L38 10"/><path d="M30 10h8v8"/>',
  // V. One key, drawn large. Two crossed ones read as scissors at this size.
  hierophant: '<circle cx="24" cy="13" r="6"/><path d="M24 19v21"/><path d="M24 31h7M24 36h6"/>',
  lovers: '<circle cx="18" cy="29" r="9"/><circle cx="30" cy="29" r="9"/><path d="M12 14l12-7 12 7"/>',
  chariot: '<circle cx="16" cy="36" r="5"/><circle cx="32" cy="36" r="5"/><path d="M11 20h26v11H11z"/><path d="M13 20l11-9 11 9"/>',
  // VIII. Force held rather than force shown. Three chevrons read as a scroll
  // control, and a circle with an arrow through it was the Emperor again.
  strength: '<circle cx="24" cy="26" r="8"/><path d="M11 10c0 13 4 22 13 26M37 10c0 13-4 22-13 26"/>',
  hermit: '<path d="M12 21h15v15H12z"/><path d="M9 21l10.5-7L30 21"/><circle cx="19.5" cy="11" r="2.5"/><circle cx="19.5" cy="28" r="3.5"/><path d="M37 9L31 40"/>',
  // XII. Hung from the beam by one ankle, the other leg crossed behind.
  hanged: '<path d="M8 10h32"/><path d="M24 10v8"/><path d="M24 18l-8 8M16 26h9"/><circle cx="24" cy="32" r="5.5"/>',
  // XIV. Poured from one vessel into the other, without spilling any of it.
  temperance: '<path d="M7 13h13l-4 9h-5z"/><path d="M16 22v7M12 29h8"/><path d="M28 26h13l-4 9h-5z"/><path d="M37 35v5M33 40h8"/><path d="M20 21c6 1 10 2 13 5"/>',
  devil: '<circle cx="24" cy="24" r="16"/><path d="M24 38.5L32.6 12.6L10.1 28.9H37.9L15.4 12.6z"/>',
  judgement: '<circle cx="10" cy="35" r="2.5"/><path d="M12.2 33.8L33 12M12.2 33.8L38 26M33 12l5 14"/><path d="M40 10a9 9 0 0 1 0 8M44 6a15 15 0 0 1 0 16"/>',
  world: '<ellipse cx="24" cy="24" rx="10" ry="16"/><circle cx="24" cy="24" r="16"/><path d="M8 24h32"/>',
}

/** Numeral, name and the order they are drawn in. */
export const ARCANA = [
  ['fool', '0', 'The Fool'], ['magician', 'I', 'The Magician'],
  ['priestess', 'II', 'The High Priestess'], ['empress', 'III', 'The Empress'],
  ['emperor', 'IV', 'The Emperor'], ['hierophant', 'V', 'The Hierophant'],
  ['lovers', 'VI', 'The Lovers'], ['chariot', 'VII', 'The Chariot'],
  ['strength', 'VIII', 'Strength'], ['hermit', 'IX', 'The Hermit'],
  ['wheel', 'X', 'Wheel of Fortune'], ['justice', 'XI', 'Justice'],
  ['hanged', 'XII', 'The Hanged Man'], ['death', 'XIII', 'Death'],
  ['temperance', 'XIV', 'Temperance'], ['devil', 'XV', 'The Devil'],
  ['tower', 'XVI', 'The Tower'], ['stars', 'XVII', 'The Star'],
  ['moon', 'XVIII', 'The Moon'], ['sun', 'XIX', 'The Sun'],
  ['judgement', 'XX', 'Judgement'], ['world', 'XXI', 'The World'],
]
