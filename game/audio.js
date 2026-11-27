/*
 * FMLAB Monsters — musica ed effetti sonori generati dal codice (Web Audio, nessun file audio).
 * API usata dal gioco: FMLABAudio.sfx(nome), FMLABAudio.music(tema), FMLABAudio.unlock()
 */
(function (root) {
  'use strict';
  root.FMLABAudio = root.FMLABAudio || { sfx() {}, music() {}, unlock() {}, stop() {}, volume: 0.8 };
})(typeof self !== 'undefined' ? self : this);
