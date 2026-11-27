/*
 * FMLAB Monsters — modelli e animazioni di personaggi e creature.
 * Si aggancia al motore 3D tramite FMLAB3D.hooks (vedi gl3d.js, "ganci per i modelli").
 * Se questo file è vuoto il motore usa i modelli di base.
 */
(function (root) {
  'use strict';
  const G3 = root.FMLAB3D;
  if (!G3 || !G3.kit) return;
})(typeof self !== 'undefined' ? self : this);
