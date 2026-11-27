/*
 * FMLAB Monsters — disegni delle creature, generati in SVG.
 * Tutti originali: corpo nel colore del tipo, un tratto per tipo
 * (fiamma, pinna, foglie, saette, punte di roccia, coda spettrale)
 * e più dettagli a ogni evoluzione.
 */
(function (root) {
  'use strict';
  const E = root.FMLABEngine;

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ---------- colori shiny (rari): una palette alternativa originale per ogni specie ----------
  const SHINY_BODY = {
    fiammino: '#6d5bd0', braciolo: '#5a49bd', vulkarn: '#4a3aa8',      // fuoco blu notte
    goccino: '#f2b84b', ondaro: '#e9a23b', abissaro: '#d78b2e',        // acqua dorata
    semino: '#ee8a3c', fogliardo: '#de6f33', silvatron: '#c85a2c',     // erba d'autunno
    voltino: '#ff7ac8', fulmix: '#ec5fb8',                              // elettro rosa
    sassetto: '#7fb7cf', granitor: '#5d99b6',                           // roccia di ghiaccio
    ombrino: '#334866', spettrax: '#26385a',                            // ombra notturna
  };
  // colori dei dettagli (fiamme, pinne, foglie, sfere, punte, occhi): normale e shiny
  const ACCENTS = {
    normal: { flame: '#ff8a1f', flame2: '#ffd23f', flame3: '#fff3b0', leaf: '#7ee08f', leaf2: '#5fcf74', petal: '#ff8fb3', core: '#ffd23f', orb: '#eaffff', eye: '#fff6a0', horn: null, spike: null, fin: null },
    fuoco: { flame: '#3fa9ff', flame2: '#9fe8ff', flame3: '#e8fbff' },
    acqua: { fin: '#fff1b8' },
    erba: { leaf: '#ffcf5a', leaf2: '#ff9f43', petal: '#ffffff', core: '#ff6b6b' },
    elettro: { orb: '#fff27a' },
    roccia: { spike: '#e3f7ff' },
    ombra: { eye: '#7df9ff', horn: '#ffd23f' },
  };
  /** Colori di una specie: { body, dark, acc } (acc = colori dei dettagli). */
  function palette(speciesId, shiny) {
    const sp = E.SPECIES[speciesId], t = E.TYPES[sp.type];
    const hue = (E.hashString(speciesId) % 30) - 15;
    const acc = Object.assign({}, ACCENTS.normal, shiny ? ACCENTS[sp.type] : {});
    if (shiny) return { body: SHINY_BODY[speciesId] || shade(t.color, 60), dark: shade(SHINY_BODY[speciesId] || t.color, -70), acc, shiny: true };
    return { body: shade(t.color, hue), dark: t.dark, acc, shiny: false };
  }

  function feature(type, stage, c, d, A) {
    A = A || ACCENTS.normal;
    switch (type) {
      case 'fuoco': {
        const h = 26 + stage * 8;
        return `<path d="M100 ${70 - h} C ${88 - stage * 3} ${78 - h * 0.5}, 82 70, 92 62 C 90 72, 100 70, 100 62 C 104 70, 112 70, 108 60 C 120 68, ${116 + stage * 2} ${74 - h * 0.5}, 100 ${70 - h} Z" fill="${A.flame2}" stroke="${d}" stroke-width="2"/>
                <path d="M100 ${74 - h * 0.6} C 94 66, 96 62, 100 60 C 104 62, 106 66, 100 ${74 - h * 0.6} Z" fill="${A.flame3}"/>` +
          (stage >= 2 ? `<path d="M150 150 C 175 140, 178 120, 168 108 C 166 122, 158 126, 150 130 Z" fill="${A.flame2}" stroke="${d}" stroke-width="2"/>` : '');
      }
      case 'acqua': {
        const f1 = A.fin || shade(c, 40), f2 = A.fin || shade(c, 30);
        return `<path d="M100 52 C 112 30, 128 30, 126 50 C 118 46, 110 50, 104 60 Z" fill="${f1}" stroke="${d}" stroke-width="2"/>
                <path d="M152 150 C 178 150, 186 128, 176 116 C 172 132, 162 136, 152 136 Z" fill="${f2}" stroke="${d}" stroke-width="2"/>` +
          (stage >= 2 ? `<path d="M48 120 C 30 118, 24 104, 30 94 C 38 104, 44 108, 54 108 Z" fill="${f2}" stroke="${d}" stroke-width="2"/>` : '') +
          (stage >= 3 ? `<path d="M80 50 C 74 30, 84 22, 92 30 C 90 38, 88 44, 88 54 Z" fill="${f1}" stroke="${d}" stroke-width="2"/>` : '');
      }
      case 'erba': {
        let leaves = `<path d="M100 60 C 96 40, 104 28, 116 26 C 118 40, 110 52, 100 60 Z" fill="${A.leaf}" stroke="${d}" stroke-width="2"/>`;
        if (stage >= 2) leaves += `<path d="M98 60 C 84 46, 76 46, 70 36 C 84 32, 96 44, 98 60 Z" fill="${A.leaf2}" stroke="${d}" stroke-width="2"/>`;
        if (stage >= 3) leaves += `<circle cx="118" cy="34" r="9" fill="${A.petal}" stroke="${d}" stroke-width="2"/><circle cx="118" cy="34" r="3.5" fill="${A.core}"/>`;
        return leaves;
      }
      case 'elettro':
        // antenne con sfere luminose e coda a spirale (niente orecchie a punta né guance)
        return `<path d="M84 64 C 80 46, 74 38, 70 30" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>
                <path d="M116 64 C 120 46, 126 38, 130 30" stroke="${d}" stroke-width="3" fill="none" stroke-linecap="round"/>
                <circle cx="70" cy="28" r="7" fill="${A.orb}" stroke="${d}" stroke-width="2"/><circle cx="70" cy="28" r="3" fill="${c}"/>
                <circle cx="130" cy="28" r="7" fill="${A.orb}" stroke="${d}" stroke-width="2"/><circle cx="130" cy="28" r="3" fill="${c}"/>
                <path d="M150 140 c 14 0, 14 -12, 4 -12 c -10 0, -10 -12, 4 -12 c 14 0, 14 -12, 4 -12" stroke="${d}" stroke-width="5" fill="none" stroke-linecap="round"/>
                <path d="M150 140 c 14 0, 14 -12, 4 -12 c -10 0, -10 -12, 4 -12 c 14 0, 14 -12, 4 -12" stroke="${shade(c, 50)}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
          (stage >= 2 ? `<path d="M100 60 L 94 44 L 102 48 L 98 32" stroke="${A.orb}" stroke-width="3" fill="none" stroke-linejoin="round"/>` : '');
      case 'roccia':
        return `<path d="M76 64 L 84 40 L 94 60 Z" fill="${A.spike || shade(c, -20)}" stroke="${d}" stroke-width="2"/>
                <path d="M106 60 L 116 36 L 124 64 Z" fill="${A.spike || shade(c, -20)}" stroke="${d}" stroke-width="2"/>
                <path d="M70 140 L 84 128 L 82 146" stroke="${d}" stroke-width="2.5" fill="none"/>
                <path d="M124 150 L 136 136 L 140 152" stroke="${d}" stroke-width="2.5" fill="none"/>` +
          (stage >= 2 ? `<path d="M44 110 L 30 92 L 52 98 Z" fill="${A.spike || shade(c, -25)}" stroke="${d}" stroke-width="2"/><path d="M156 110 L 170 92 L 148 98 Z" fill="${A.spike || shade(c, -25)}" stroke="${d}" stroke-width="2"/>` : '');
      case 'ombra':
        return `<path d="M58 140 C 58 170, 72 168, 76 182 C 82 168, 92 172, 100 184 C 108 172, 118 168, 124 182 C 128 168, 142 170, 142 140 Z" fill="${shade(c, -10)}" opacity=".9"/>
                <path d="M84 58 C 80 40, 88 30, 96 36 C 92 44, 92 50, 94 58 Z" fill="${A.horn || shade(c, -30)}"/>` +
          (stage >= 2 ? `<path d="M116 56 C 122 36, 134 34, 136 44 C 128 46, 124 52, 122 60 Z" fill="${A.horn || shade(c, -30)}"/>` : '');
      default: return '';
    }
  }

  /** SVG di una creatura. back = vista da dietro (la tua creatura in lotta). */
  function monsterSVG(speciesId, opts) {
    opts = opts || {};
    const sp = E.SPECIES[speciesId];
    if (!sp) return '';
    const pal = palette(speciesId, !!opts.shiny);
    const c = pal.body, d = pal.dark, A = pal.acc;
    const stage = sp.stage;
    const scale = 0.78 + stage * 0.1;
    const gid = 'g' + speciesId + (opts.back ? 'b' : '') + (opts.silhouette ? 's' : '') + (pal.shiny ? 'x' : '');
    const isRock = sp.type === 'roccia', isGhost = sp.type === 'ombra';
    const body = isRock
      ? `<path d="M56 150 L 50 104 L 70 70 L 100 60 L 132 70 L 150 104 L 144 150 L 118 166 L 82 166 Z" fill="url(#${gid})" stroke="${d}" stroke-width="3"/>`
      : `<ellipse cx="100" cy="${isGhost ? 108 : 116}" rx="${50 + stage * 2}" ry="${isGhost ? 50 : 54}" fill="url(#${gid})" stroke="${d}" stroke-width="3"/>`;
    const belly = isGhost ? '' : `<ellipse cx="100" cy="134" rx="30" ry="26" fill="${shade(c, 55)}" opacity=".75"/>`;
    const eyeY = isGhost ? 100 : 104;
    const eyes = opts.back ? '' : isGhost
      ? `<ellipse cx="82" cy="${eyeY}" rx="9" ry="11" fill="${A.eye}"/><ellipse cx="118" cy="${eyeY}" rx="9" ry="11" fill="${A.eye}"/>
         <ellipse cx="82" cy="${eyeY + 2}" rx="3.5" ry="5" fill="#2a1056"/><ellipse cx="118" cy="${eyeY + 2}" rx="3.5" ry="5" fill="#2a1056"/>`
      : `<ellipse cx="82" cy="${eyeY}" rx="10" ry="12" fill="#fff"/><ellipse cx="118" cy="${eyeY}" rx="10" ry="12" fill="#fff"/>
         <circle cx="84" cy="${eyeY + 2}" r="5.5" fill="#1b1b2f"/><circle cx="120" cy="${eyeY + 2}" r="5.5" fill="#1b1b2f"/>
         <circle cx="86" cy="${eyeY - 1}" r="2" fill="#fff"/><circle cx="122" cy="${eyeY - 1}" r="2" fill="#fff"/>
         ${stage >= 3 ? `<path d="M70 ${eyeY - 16} L 92 ${eyeY - 10}" stroke="${d}" stroke-width="3"/><path d="M130 ${eyeY - 16} L 108 ${eyeY - 10}" stroke="${d}" stroke-width="3"/>` : ''}`;
    const mouth = opts.back ? '' : `<path d="M90 ${eyeY + 20} Q 100 ${eyeY + 28} 110 ${eyeY + 20}" stroke="${d}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
    const feet = isGhost ? '' : `<ellipse cx="78" cy="168" rx="13" ry="7" fill="${shade(c, -25)}" stroke="${d}" stroke-width="2"/><ellipse cx="122" cy="168" rx="13" ry="7" fill="${shade(c, -25)}" stroke="${d}" stroke-width="2"/>`;
    const arms = stage >= 2 && !isGhost ? `<ellipse cx="52" cy="122" rx="9" ry="15" fill="${shade(c, -15)}" stroke="${d}" stroke-width="2" transform="rotate(25 52 122)"/><ellipse cx="148" cy="122" rx="9" ry="15" fill="${shade(c, -15)}" stroke="${d}" stroke-width="2" transform="rotate(-25 148 122)"/>` : '';
    const sil = opts.silhouette ? `<g style="filter:brightness(0)">` : `<g>`;
    return `<svg viewBox="0 0 200 200" width="${opts.size || 120}" height="${opts.size || 120}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${opts.silhouette ? '???' : sp.name}">
      <defs><radialGradient id="${gid}" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="${shade(c, 45)}"/><stop offset="1" stop-color="${c}"/></radialGradient></defs>
      ${sil}<g transform="translate(100 110) scale(${opts.back ? -scale : scale} ${scale}) translate(-100 -110)">
        <ellipse cx="100" cy="182" rx="${46 + stage * 4}" ry="8" fill="#000" opacity=".18"/>
        ${feet}${arms}${body}${belly}${feature(sp.type, stage, c, d, A)}${eyes}${mouth}
      </g></g>${pal.shiny && !opts.silhouette ? SPARKLE : ''}</svg>`;
  }

  // stellina degli shiny, in alto a destra
  const SPARKLE = `<g transform="translate(168 30)"><path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" fill="#fff59d" stroke="#f59e0b" stroke-width="1.5"/>
    <path d="M-14 18 L-12 23 L-7 25 L-12 27 L-14 32 L-16 27 L-21 25 L-16 23 Z" fill="#fff59d" stroke="#f59e0b" stroke-width="1"/></g>`;

  root.FMLABArt = { monsterSVG, shade, palette, SHINY_BODY, ACCENTS };
})(typeof self !== 'undefined' ? self : this);
