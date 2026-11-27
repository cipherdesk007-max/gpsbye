/*
 * FMLAB Monsters — la storia offline: personaggi, allenatori, Guardiani, medaglie, blocchi.
 * Solo dati e piccole regole: la logica (vista, dialoghi, lotte) sta in game.js.
 *
 * Trama: il Prof. Ferri ha notato che i Cristalli della regione si stanno spegnendo e le
 * creature sono agitate. Quattro Guardiani custodiscono ognuno una Medaglia-cristallo:
 * chi le riunisce può sfidare il Campione Aurelio all'ingresso della Grotta Cupa e
 * riaccendere il Cristallo Madre. Rocco, il nipote del Professore, vuole arrivarci prima di te.
 */
(function (root) {
  'use strict';
  const Wd = root.FMLABWorld || (typeof require === 'function' ? require('./world.js') : null);

  /** Casella libera accanto al sentiero alla riga y: side -1 = ovest, +1 = est. Guarda verso il sentiero. */
  function beside(y, side, k0) {
    const px = Wd.pathX(y);
    for (let k = k0 || 1; k <= 5; k++) {
      const x = side < 0 ? px - k : px + 1 + k;
      const t = Wd.grid[y] && Wd.grid[y][x];
      if (!t || Wd.isSolid(t) || t === '=' || t === 'D' || t === 'L') continue;
      if (Wd.items.some((it) => it.x === x && it.y === y)) continue;
      return { x, y, face: [side < 0 ? 1 : -1, 0] };
    }
    return beside(y + 1, side, k0);
  }

  // squadra del rivale: parte sempre col tipo che batte il tuo compagno
  const COUNTER = { fiammino: ['goccino', 'ondaro', 'abissaro'], goccino: ['semino', 'fogliardo', 'silvatron'], semino: ['fiammino', 'braciolo', 'vulkarn'] };
  function rivalLine(starter) {
    const base = { fiammino: 'fiammino', braciolo: 'fiammino', vulkarn: 'fiammino', goccino: 'goccino', ondaro: 'goccino', abissaro: 'goccino', semino: 'semino', fogliardo: 'semino', silvatron: 'semino' }[starter] || 'fiammino';
    return COUNTER[base];
  }

  const BADGES = [
    { id: 'prato', name: 'Medaglia Foglia', icon: '🍃', color: '#4cc96b', who: 'Flora' },
    { id: 'fiume', name: 'Medaglia Onda', icon: '🌊', color: '#3b9dff', who: 'Marina' },
    { id: 'bosco', name: 'Medaglia Ombra', icon: '🌑', color: '#8b5cf6', who: 'Corvino' },
    { id: 'grotta', name: 'Medaglia Pietra', icon: '🪨', color: '#b08d57', who: 'Petra' },
    { id: 'campione', name: 'Corona del Campione', icon: '👑', color: '#f59e0b', who: 'Aurelio' },
  ];

  /*
   * Allenatori. kind: 'route' (ti vede e ti viene incontro), 'rival' (come route, ma la squadra dipende dal tuo
   * compagno), 'guardian' / 'champion' (li sfidi parlandoci). needs: medaglie o vittorie necessarie perché compaia.
   * team: [[specie, livello], ...] oppure funzione(save) → lista. ai: 'facile' | 'normale' | 'esperto'.
   */
  const TRAINERS = [
    {
      id: 'rival1', kind: 'rival', name: 'Rocco', title: 'Rivale', look: 'rivale', pos: { x: 17, y: 46, face: [-1, 0] }, sight: 2, ai: 'facile',
      team: (s) => [[rivalLine(s.starter)[0], 5]],
      intro: ['Ehi, {nome}! Il nonno ha dato una creatura anche a te?', 'Io ho scelto quella giusta: quella che batte la tua. Vediamo subito chi è il più forte!'],
      defeat: ['Cosa?! Ho perso al primo colpo…', 'Va bene, ma ricordati di me. Ci rivediamo al fiume!'],
      reward: 2,
    },
    {
      id: 'pippo', kind: 'route', name: 'Pippo', title: 'Ragazzino', look: 'bimba', at: [41, -1], sight: 3, ai: 'facile', needs: ['rival1'],
      team: [['semino', 4]],
      intro: ['Fermo lì! Ho appena catturato la mia prima creatura e voglio provarla!'],
      defeat: ['Uffa! Torno ad allenarmi nell\'erba alta.'],
      reward: 1,
    },
    {
      id: 'lucia', kind: 'route', name: 'Lucia', title: 'Botanica', look: 'nonna', at: [38, 1], sight: 3, ai: 'facile', needs: ['rival1'], turns: [[-1, 0], [0, 1]],
      team: [['semino', 5], ['voltino', 5]],
      intro: ['Studio come l\'erba del prato nasconde le creature. Mi aiuti con un esperimento? Una lotta!'],
      defeat: ['Dati preziosissimi, grazie! Flora ti aspetta a nord: è severa ma giusta.'],
      reward: 1,
    },
    {
      id: 'flora', kind: 'guardian', badge: 'prato', name: 'Flora', title: 'Guardiana del Prato', look: 'guardiano_prato', at: [35, 1], ai: 'esperto', needs: ['rival1'],
      team: [['semino', 8], ['fogliardo', 10]],
      intro: ['Sono Flora, custode del Cristallo Verde.', 'Il prato insegna la pazienza: vediamo se sai aspettare il momento giusto.'],
      defeat: ['Le tue creature crescono sane. Prendi la Medaglia Foglia.', 'Con questa la guardia ti lascerà passare il ponte sul fiume.'],
      after: ['Il fiume è più insidioso del prato: le creature d\'acqua resistono al fuoco.'],
      reward: 3,
    },
    {
      id: 'rival2', kind: 'rival', name: 'Rocco', title: 'Rivale', look: 'rivale', at: [25, 1], sight: 3, ai: 'normale', needs: ['prato'],
      team: (s) => [[rivalLine(s.starter)[1], 13], ['voltino', 11]],
      intro: ['Eccoti finalmente! Ho già esplorato tutta la riva.', 'La mia creatura si è evoluta, sai? Preparati!'],
      defeat: ['Di nuovo… Come fai?!', 'Marina ti aspetta più avanti. Io vado nel bosco: lì ti batterò di sicuro.'],
      reward: 3,
    },
    {
      id: 'gino', kind: 'route', name: 'Gino', title: 'Pescatore', look: 'pescatore', at: [31, -1], sight: 3, ai: 'normale', needs: ['prato'],
      team: [['goccino', 9], ['goccino', 10]],
      intro: ['Shh! Spaventi i pesci… Già che ci sei, lottiamo!'],
      defeat: ['Hai una mano più ferma della mia canna da pesca.'],
      reward: 1,
    },
    {
      id: 'marina', kind: 'guardian', badge: 'fiume', name: 'Marina', title: 'Guardiana del Fiume', look: 'guardiano_fiume', at: [26, -1], ai: 'esperto', needs: ['prato'],
      team: [['goccino', 12], ['voltino', 13], ['ondaro', 15]],
      intro: ['La corrente porta via chi non sa dove andare.', 'Io sono Marina. Mostrami la tua rotta!'],
      defeat: ['Hai tenuto la barra dritta. Ecco la Medaglia Onda.', 'Adesso la guardia del bosco ti farà entrare.'],
      after: ['Nel Bosco Fitto la notte è lunga: le creature d\'ombra escono col buio.'],
      reward: 3,
    },
    {
      id: 'ada', kind: 'route', name: 'Ada', title: 'Esploratrice', look: 'bimba', at: [20, 1], sight: 4, ai: 'normale', needs: ['fiume'], turns: [[-1, 0], [0, 1], [0, -1]],
      team: [['ombrino', 12], ['fogliardo', 13]],
      intro: ['Mi sono persa tre volte stamattina. Una lotta mi schiarisce le idee!'],
      defeat: ['Ok, ok, hai vinto. Corvino sta nella radura a est, se trovi la strada.'],
      reward: 2,
    },
    {
      id: 'leo', kind: 'route', name: 'Leo', title: 'Campeggiatore', look: 'pescatore', at: [16, -1], sight: 3, ai: 'normale', needs: ['fiume'],
      team: [['voltino', 13], ['sassetto', 13]],
      intro: ['La mia tenda è qui da una settimana: conosco ogni creatura del bosco!'],
      defeat: ['Forse dovrei tornare a casa a fare una doccia…'],
      reward: 2,
    },
    {
      id: 'corvino', kind: 'guardian', badge: 'bosco', name: 'Corvino', title: 'Guardiano del Bosco', look: 'guardiano_bosco', pos: { x: 24, y: 18, face: [-1, 0] }, ai: 'esperto', needs: ['fiume'],
      team: [['ombrino', 16], ['voltino', 16], ['spettrax', 19]],
      intro: ['Pochi trovano la radura. Ancora meno ne escono vincitori.', 'Il buio non è nemico, se lo conosci. Tu lo conosci?'],
      defeat: ['Hai visto oltre le ombre. La Medaglia Ombra è tua.', 'La grotta ora ti è aperta. Petra non perdona gli errori.'],
      after: ['Petra scava la Grotta Cupa da vent\'anni: le sue creature sono dure come la roccia.'],
      reward: 4,
    },
    {
      id: 'rival3', kind: 'rival', name: 'Rocco', title: 'Rivale', look: 'rivale', at: [14, -1], sight: 3, ai: 'esperto', needs: ['bosco'],
      team: (s) => [[rivalLine(s.starter)[1], 21], ['ombrino', 19], ['sassetto', 20]],
      intro: ['Ho tre medaglie anch\'io… quasi. Ok, due.', 'Ma questa volta ho studiato ogni tua mossa. Niente scuse!'],
      defeat: ['…Hai vinto tu. E va bene così.', 'Il nonno aveva ragione su di te. Vai, il Campione ti aspetta. Io tifo per te.'],
      reward: 4,
    },
    {
      id: 'bruno', kind: 'route', name: 'Bruno', title: 'Minatore', look: 'pescatore', at: [9, -1], sight: 4, ai: 'normale', needs: ['bosco'],
      team: [['sassetto', 17], ['granitor', 19]],
      intro: ['Scavo da ore e non ho trovato un cristallo. Almeno una lotta!'],
      defeat: ['Duro come la roccia, tu!'],
      reward: 2,
    },
    {
      id: 'iris', kind: 'route', name: 'Iris', title: 'Speleologa', look: 'nonna', at: [5, 1], sight: 4, ai: 'esperto', needs: ['bosco'], turns: [[-1, 0], [0, 1]],
      team: [['spettrax', 20], ['ombrino', 19]],
      intro: ['Qui sotto i cristalli spenti fanno impazzire le creature. Sei pronto?'],
      defeat: ['Sei pronto davvero. Petra è più avanti, dove la grotta si allarga.'],
      reward: 3,
    },
    {
      id: 'petra', kind: 'guardian', badge: 'grotta', name: 'Petra', title: 'Guardiana della Grotta', look: 'guardiano_grotta', at: [7, -1], ai: 'esperto', needs: ['bosco'],
      team: [['sassetto', 20], ['granitor', 22], ['granitor', 24]],
      intro: ['La roccia non si piega. Nemmeno io.', 'Se vuoi la Medaglia Pietra dovrai spezzarmi!'],
      defeat: ['…Crepata. Prendi la Medaglia Pietra, te la sei guadagnata.', 'Ora hai quattro medaglie: il Campione Aurelio ti aspetta all\'ingresso del Cristallo Madre, a nord.'],
      after: ['Aurelio usa creature di ogni tipo. Porta una squadra varia!'],
      reward: 4,
    },
    {
      id: 'aurelio', kind: 'champion', badge: 'campione', name: 'Aurelio', title: 'Campione', look: 'campione', at: [2, 1], ai: 'esperto', needs: ['grotta'],
      team: [['fulmix', 27], ['spettrax', 28], ['abissaro', 29], ['silvatron', 29], ['vulkarn', 31]],
      intro: ['Quattro medaglie. Erano anni che nessuno arrivava fin qui.', 'Dietro di me c\'è il Cristallo Madre. Per riaccenderlo serve un cuore che non si arrende.', 'Fammi vedere il tuo.'],
      defeat: ['Il Cristallo si sta riaccendendo… lo senti?', 'Da oggi il Campione sei tu, {nome}. La Corona è tua.'],
      after: ['Il Cristallo Madre brilla di nuovo. Ora completa l\'Archivio e sfida i tuoi amici online!'],
      reward: 10,
    },
  ];
  // posizione finale di ogni allenatore
  TRAINERS.forEach((t) => { if (!t.pos) t.pos = beside(t.at[0], t.at[1]); });

  /** Blocchi morbidi: chi sta lì e cosa dice se non hai la medaglia. */
  const GATES = [
    {
      id: 'ponte', need: 'prato', name: 'Guardia Nino', look: 'pescatore', test: (x, y, t) => t === '=',
      pos: beside(30, 1),
      lines: ['Alt! Il ponte è fragile: lo attraversa solo chi ha la Medaglia Foglia.', 'Flora, la Guardiana del Prato, sta a nord del prato vicino al sentiero.'],
      ok: ['Una Medaglia Foglia! Prego, passa pure. Occhio alla corrente.'],
    },
    {
      id: 'bosco', need: 'fiume', name: 'Guardia Tea', look: 'nonna', test: (x, y) => y <= 23,
      pos: beside(24, 1),
      lines: ['Il Bosco Fitto è pericoloso: entra solo chi ha la Medaglia Onda.', 'Marina, la Guardiana del Fiume, è sulla riva nord.'],
      ok: ['La Medaglia Onda! Il bosco è tutto tuo. Non perderti!'],
    },
    {
      id: 'grotta', need: 'bosco', name: 'Guardia Ugo', look: 'pescatore', test: (x, y) => y <= 12,
      pos: beside(13, -1),
      lines: ['Nella Grotta Cupa si entra solo con la Medaglia Ombra.', 'Corvino vive nella radura a est del bosco.'],
      ok: ['Medaglia Ombra… rispetto. Entra pure, e porta una luce.'],
    },
  ];

  const PROF = {
    name: 'Prof. Ferri', look: 'prof', pos: { x: 10, y: 49, face: [0, 1] },
    intro: [
      'Eccoti, {nome}! Sono il Prof. Ferri. Ti ho chiamato perché ho bisogno di te.',
      'I Cristalli della regione si stanno spegnendo e le creature sono agitate.',
      'Quattro Guardiani custodiscono ognuno una Medaglia-cristallo: Flora nel Prato, Marina al Fiume, Corvino nel Bosco e Petra nella Grotta.',
      'Riuniscile e sfida il Campione Aurelio: solo così il Cristallo Madre si riaccenderà.',
      'Mio nipote Rocco è già partito… Corri! E ricordati: il Centro col tetto rosso cura la squadra.',
    ],
    hints: ['Vai a nord, oltre il cancello del Borgo. Le Medaglie sono segnate nel Diario.', 'Passa da me al Laboratorio ogni giorno: ti regalo capsule nuove.'],
  };

  /** Obiettivo attuale da mostrare nel Diario. */
  function objective(st) {
    const b = st.badges || {}, beaten = st.beaten || {};
    if (!st.intro) return 'Parla col Prof. Ferri nel Borgo FMLAB.';
    if (!beaten.rival1) return 'Esci dal Borgo verso nord: qualcuno ti aspetta al cancello.';
    if (!b.prato) return 'Sfida Flora, la Guardiana del Prato, a nord del Prato Ventoso.';
    if (!b.fiume) return 'Attraversa il ponte e sfida Marina sulla riva nord del fiume.';
    if (!b.bosco) return 'Entra nel Bosco Fitto e trova Corvino nella radura a est.';
    if (!b.grotta) return 'Scendi nella Grotta Cupa e sfida Petra.';
    if (!b.campione) return 'Sfida il Campione Aurelio all\'ingresso del Cristallo Madre, in fondo alla grotta.';
    return 'Sei il Campione! Completa l\'Archivio e sfida gli amici online.';
  }

  const API = { BADGES, TRAINERS, GATES, PROF, objective, beside, rivalLine };
  root.FMLABStory = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : this);
