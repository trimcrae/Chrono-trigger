// maps.js — map data. Rows are auto-padded so hand-authored grids can't desync.

function mkMap(o) {
  const w = Math.max(...o.rows.map(r => r.length));
  o.rows = o.rows.map(r => r.padEnd(w, o.fill || '.'));
  o.w = w; o.h = o.rows.length;
  o.npcs = o.npcs || [];
  o.exits = o.exits || [];
  o.props = o.props || [];
  o.solids = o.solids || [];
  return o;
}

/* ============================== CRONO'S ROOM ============================== */
export const ROOM = mkMap({
  id: 'room', name: "Crono's Room", indoor: true, fill: '#',
  rows: [
    '################',
    '#w####ww####w###',
    '#ffffffffffffff#',
    '#bbfffffffffB#f#',
    '#qqffffffffffff#',
    '#ffffffffffffff#',
    '#ffffffffffffff#',
    '#fffffffffffftf#',
    '#ffffffffffffff#',
    '#ffffffffffpfff#',
    '#ffffffffffffff#',
    '#ffffffffffffff#',
    '#sfffffffffffff#',
    '################',
  ],
  exits: [{ x: 1, y: 12, to: 'house', tx: 16, ty: 9, dir: 'down', fade: true }],
  npcs: [],
  looks: {
    'b:1,3': "Crono's bed. Warm and inviting...",
    'b:2,3': "Crono's bed. Warm and inviting...",
    'q:1,4': 'A comfortable bed. Maybe later — the Fair is today!',
    'q:2,4': 'A comfortable bed. Maybe later — the Fair is today!',
    'B:12,3': 'Books about swordsmanship, and one about monsters.',
    't:13,7': "Crono's desk. A wooden practice sword leans against it.",
    'w:1,1': 'Sunlight streams in. A perfect day for the Fair!',
    'w:6,1': 'Bright blue skies over Truce Village.',
    'w:7,1': 'You can just make out the Fair tents to the north.',
    'w:12,1': 'The morning sun is already high.',
    'p:11,9': 'A well-watered houseplant.',
    's:1,12': 'The stairs lead down.',
  },
});

/* ============================== CRONO'S HOUSE ============================== */
export const HOUSE = mkMap({
  id: 'house', name: "Crono's House", indoor: true, fill: '#',
  rows: [
    '##################',
    '#w###kk#####ww####',
    '#ffffffffffffffff#',
    '#fBffffffffffffpf#',
    '#fffffgggffffffff#',
    '#fffffgggffffffff#',
    '#ffffffffffffffff#',
    '#rrrrrfffffffffff#',
    '#rrrrrffffffffffs#',
    '#rrrrrfffffffffff#',
    '#ffffffffffffffff#',
    '#ffffffffffffffff#',
    '#######DD#########',
    '##################',
  ],
  exits: [
    { x: 16, y: 8, to: 'room', tx: 1, ty: 11, dir: 'down', fade: true },
    { x: 7, y: 12, to: 'world', tx: 5, ty: 8, dir: 'down', fade: true },
    { x: 8, y: 12, to: 'world', tx: 5, ty: 8, dir: 'down', fade: true },
  ],
  npcs: [
    { id: 'mom', char: 'mom', x: 4, y: 7, dir: 'down', name: 'Mom', wander: false },
    { id: 'cat', char: 'cat', x: 11, y: 9, dir: 'down', name: 'Cat', wander: true },
  ],
  looks: {
    'k:5,1': 'Something is simmering on the stove.',
    'k:6,1': 'Fresh bread, still warm.',
    'B:2,3': 'Old books. One is a history of the Kingdom of Guardia.',
    'g:6,4': 'Breakfast is on the table. Mom made your favourite.',
    'g:7,4': 'Breakfast is on the table. Mom made your favourite.',
    'g:6,5': 'A pot of tea, still steaming.',
    'p:15,3': 'A tidy little houseplant.',
    'w:1,1': 'You can hear the Fair bells ringing outside!',
    'w:12,1': 'Crowds are already heading north to Leene Square.',
    's:16,8': 'The stairs lead up to your room.',
  },
});

/* ============================== TRUCE VILLAGE (outside) ============================== */
export const WORLD = mkMap({
  id: 'world', name: 'Truce Village', fill: '.',
  rows: [
    'TTTTTTTTTT==TTTTTTTTTTTT',
    'TT........==..........TT',
    'T,,.,,....==....,,,,,.TT',
    'T.........==..........,T',
    'T...RRRR..==...........T',
    'T...RRRR..==...WWWWW...T',
    'T...HwHH..==...W...W...T',
    'T...HDHH.===...W...W...T',
    'T....==...==...WWWWW...T',
    'T....========..........T',
    'T.........==..........,T',
    'T....,,...==....~~~~...T',
    'T.........==....~~~~...T',
    'TT........==..........TT',
    'TT........==..........TT',
    'TTTT......==........TTTT',
    'TTTTTTTT..==..TTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  exits: [
    { x: 5, y: 7, to: 'house', tx: 7, ty: 11, dir: 'up', fade: true },
    { x: 10, y: 0, to: 'square', tx: 13, ty: 19, dir: 'up', fade: true },
    { x: 11, y: 0, to: 'square', tx: 13, ty: 19, dir: 'up', fade: true },
  ],
  npcs: [
    { id: 'v_kid', char: 'kid', x: 14, y: 11, dir: 'up', name: 'Boy', wander: true,
      lines: ['The Millennial Fair is up north!', 'Everyone in Guardia is there!'] },
    { id: 'v_old', char: 'villager1', x: 17, y: 6, dir: 'down', name: 'Villager', wander: false,
      lines: ["1000 years since the Kingdom of Guardia was founded!", "Leene's Bell will ring at the Fair. Go hear it, Crono!"] },
    { id: 'v_dog', char: 'cat', x: 8, y: 13, dir: 'left', name: 'Cat', wander: true },
  ],
  looks: {
    'w:5,6': "Crono's house.",
    '~:16,11': 'The water sparkles in the morning sun.',
    'W:15,5': 'A neighbor keeps chickens in this pen.',
  },
});

/* ============================== LEENE SQUARE ============================== */
export const SQUARE = mkMap({
  id: 'square', name: 'Leene Square', fill: '.',
  rows: [
    'TTTTTTTTTTTT==TTTTTTTTTTTTTT',
    'T,,........P==P..........,,T',
    'T..EEE..PPPPPPPPPPPP..EEE..T',
    'T..eee..PPPPPPPPPPPP..eee..T',
    'T..ccc..PPPPPPPPPPPP..ccc..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T..PPPPPPPPLLLLPPPPPPPPPP..T',
    'T..PPPPPPPPLLLLPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T..EEE..PPPPPPPPPPPP..EEE..T',
    'T..eee..PPPPPPPPPPPP..eee..T',
    'T..ccc..PPPPPPPPPPPP..ccc..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPPPPPPPPPP..T',
    'T,,.PPPPPPPPPPPPPPPPPPPP,,.T',
    'T...PPPPPPPPPPPPPPPPPPPP...T',
    'TT..PPPPPPPPPPPPPPPPPPPP..TT',
    'TTTTTTTTTTTT==TTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  exits: [
    { x: 12, y: 20, to: 'world', tx: 10, ty: 1, dir: 'down', fade: true },
    { x: 13, y: 20, to: 'world', tx: 10, ty: 1, dir: 'down', fade: true },
    { x: 12, y: 0, to: 'telepod', tx: 10, ty: 12, dir: 'up', fade: true, needFlag: 'metMarle' },
    { x: 13, y: 0, to: 'telepod', tx: 10, ty: 12, dir: 'up', fade: true, needFlag: 'metMarle' },
  ],
  // Leene's Bell tower sits on the L block (7..15, 7..9)
  props: [
    { x: 11 * 16 + 8, y: 10 * 16 - 64, img: 'bell' },
    { x: 3 * 16, y: 6 * 16 - 10, img: 'balloon' },
    { x: 24 * 16, y: 6 * 16 - 10, img: 'balloon' },
    { x: 6 * 16, y: 18 * 16 - 10, img: 'balloon' },
    { x: 20 * 16, y: 17 * 16 - 10, img: 'balloon' },
  ],
  solids: [{ x: 11, y: 8, w: 4, h: 2 }],
  npcs: [
    { id: 'candyman', char: 'villager3', x: 4, y: 5, dir: 'down', name: 'Candy Vendor',
      lines: ['Sweet, sweet candy! Only 10G!', 'One bite and you will float away!'] },
    { id: 'drinkgirl', char: 'villager2', x: 23, y: 5, dir: 'down', name: 'Soda Vendor',
      lines: ['Ice cold soda, fresh from Medina!', 'Best drink at the Millennial Fair!'] },
    { id: 'singer', char: 'villager2', x: 4, y: 15, dir: 'down', name: 'Fair Singer',
      lines: ['La la la~ The bell of Leene rings for peace!', 'Queen Leene saved this kingdom long ago...'] },
    { id: 'racer', char: 'villager1', x: 23, y: 15, dir: 'down', name: 'Race Booth',
      lines: ['Step right up! Bet on the running races!', 'Johnny of the Bike Gang is unbeatable, they say.'] },
    { id: 'fairgoer1', char: 'villager1', x: 17, y: 11, dir: 'left', name: 'Fairgoer', wander: true,
      lines: ["Lucca's invention is on display up north!", 'That girl is a genius... or a menace.'] },
    { id: 'fairgoer2', char: 'kid', x: 11, y: 17, dir: 'up', name: 'Kid', wander: true,
      lines: ['Gato the robot sings when you fight him!', 'I got 15 Silver Points from Gato!'] },
    { id: 'fairgoer3', char: 'guard', x: 14, y: 4, dir: 'down', name: 'Knight',
      lines: ['I serve the Knights of the Square Table.', 'Nothing shall disturb the Millennial Fair. Nothing!'] },
    { id: 'fairgoer4', char: 'villager3', x: 9, y: 12, dir: 'right', name: 'Fairgoer', wander: true,
      lines: ['A thousand years of Guardia! Long live the King!'] },
    { id: 'fairgoer5', char: 'villager2', x: 8, y: 8, dir: 'right', name: 'Fairgoer', wander: true,
      lines: ['They say the King himself may visit today!'] },
    { id: 'fairgoer6', char: 'guard', x: 19, y: 8, dir: 'left', name: 'Knight',
      lines: ['Keep clear of the bell rope, citizen.'] },
    { id: 'fairgoer7', char: 'kid', x: 16, y: 15, dir: 'down', name: 'Girl', wander: true,
      lines: ['Wanna race? I bet I am faster than you!'] },
    { id: 'fairgoer8', char: 'villager3', x: 7, y: 18, dir: 'up', name: 'Fairgoer', wander: true,
      lines: ['Buy a balloon! No? Suit yourself.'] },
    { id: 'gato', char: null, x: 18, y: 17, dir: 'down', name: 'Gato', prop: 'gato', pw: 40, ph: 48 },
  ],
  looks: {
    'L:11,8': "Leene's Bell.",
    'L:12,8': "Leene's Bell.",
    'c:4,4': 'A candy stall, piled high with sweets.',
    'c:23,4': 'A soda stall. The bottles are frosty.',
    'c:4,14': 'A little stage. A girl is singing about Queen Leene.',
    'c:23,14': 'The race booth. A crowd is placing bets.',
  },
});

/* ============================== LUCCA'S EXHIBIT ============================== */
export const TELEPOD = mkMap({
  id: 'telepod', name: "Lucca's Telepod Exhibit", fill: '.',
  rows: [
    'TTTTTTTTTTTTTTTTTTTT',
    'T..................T',
    'T...MMMMMMMMMMMM...T',
    'T...M....M...M.M...T',
    'T..PPPPPPPPPPPPPP..T',
    'T..PPGGGPPPPGGGPP..T',
    'T..PPGGGPPPPGGGPP..T',
    'T..PPGGGPPPPGGGPP..T',
    'T..PPPPPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPP..T',
    'T..PPPPPPPPPPPPPP..T',
    'T...PPPPPPPPPPPP...T',
    'T....PPPPPPPPPP....T',
    'TTTTTTTTT==TTTTTTTTT',
  ],
  exits: [
    { x: 9, y: 13, to: 'square', tx: 13, ty: 1, dir: 'down', fade: true },
    { x: 10, y: 13, to: 'square', tx: 13, ty: 1, dir: 'down', fade: true },
  ],
  npcs: [
    { id: 'lucca', char: 'lucca', x: 10, y: 3, dir: 'down', name: 'Lucca',
      lines: ['Behold! The Telepod! My greatest invention... so far.'] },
    { id: 'taban', char: 'taban', x: 13, y: 4, dir: 'down', name: 'Taban',
      lines: ['My daughter built this contraption herself!', 'Step right up and be teleported!'] },
    { id: 'crowd1', char: 'villager1', x: 4, y: 10, dir: 'up', name: 'Spectator', lines: ['Is that thing safe...?'] },
    { id: 'crowd2', char: 'villager2', x: 6, y: 11, dir: 'up', name: 'Spectator', lines: ['Science! What a time to be alive!'] },
    { id: 'crowd3', char: 'kid', x: 14, y: 10, dir: 'up', name: 'Kid', wander: true, lines: ['Zap! Pow! Do it again!'] },
    { id: 'crowd4', char: 'villager3', x: 16, y: 11, dir: 'left', name: 'Spectator', lines: ['I heard the last test blew a hole in the roof.'] },
  ],
  looks: {
    'M:4,2': 'Humming machinery. Cables snake everywhere.',
    'G:5,5': 'The left Telepod platform. It crackles with energy.',
    'G:13,5': 'The right Telepod platform.',
  },
});

export const MAPS = { room: ROOM, house: HOUSE, world: WORLD, square: SQUARE, telepod: TELEPOD };
