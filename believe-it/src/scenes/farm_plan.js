// "Believe It" — Hinterkaifeck farmstead plan (metres; +x east, +y up, -z north; the yard is south, z > 0).
// Long house x[-14, 11] z[-8.6, 0]: dwelling (west) + stable (east) under one roof; barn wing x[11, 19.6] z[-15.3, 4.2] at a right angle.
// One source of truth for the builder, the colliders, the lights and the viewer's jump points.

export const Y = { live: 0.35, stab: 0.05, beam: 2.62, ceil: 2.82, attic: 3.0, eave: 4.0, cut: 2.36, ridge: 7.87 };
export const PITCH = 0.9; // roof slope (rise per metre), ~42 degrees
export const HOUSE = { x0: -14, x1: 11, z0: -8.6, z1: 0, t: 0.5, ridgeZ: -4.3 };
export const BARN = { x0: 11, x1: 19.6, z0: -15.3, z1: 4.2, t: 0.45, ridgeX: 15.3 };
export const ROOF_T = 0.25, OVER = 0.5;

export const ROOMS = {
  r1: { n: 1, name: 'Комната Андреаса и Цецилии', x0: -13.5, x1: -8.68, z0: -4.52, z1: -0.5, y: Y.live },
  r2: { n: 2, name: 'Комната служанки', x0: -13.5, x1: -9.18, z0: -8.1, z1: -4.68, y: Y.live },
  r3: { n: 3, name: 'Сени', x0: -8.52, x1: -5.68, z0: -4.52, z1: -0.5, y: Y.live },
  r4: { n: 4, name: 'Кухня', x0: -9.02, x1: -3.68, z0: -8.1, z1: -4.68, y: Y.live },
  r5: { n: 5, name: 'Комната Виктории и детей', x0: -5.52, x1: -0.2, z0: -4.52, z1: -0.5, y: Y.live },
  r6: { n: 6, name: 'Кладовая', x0: -3.52, x1: -0.2, z0: -8.1, z1: -4.68, y: Y.live },
  r7: { n: 7, name: 'Хлев', x0: 0.2, x1: 11, z0: -8.1, z1: -0.5, y: Y.stab },
  r8: { n: 8, name: 'Кормовая', x0: 7.36, x1: 11, z0: -8.1, z1: -4.68, y: Y.stab },
  r9: { n: 9, name: 'Гумно', x0: 11.45, x1: 16.84, z0: -14.85, z1: 3.75, y: Y.stab },
  r10: { n: 10, name: 'Хозяйственная комната', x0: 17, x1: 19.15, z0: -7.8, z1: -3.5, y: Y.stab },
  r11: { n: 11, name: 'Машинное отделение', x0: 17, x1: 19.15, z0: -3.34, z1: 3.75, y: Y.stab },
  attic: { name: 'Чердак', x0: -13.5, x1: 11, z0: -8.1, z1: -0.5, y: Y.attic },
  loft: { name: 'Сеновал над гумном', x0: 11.45, x1: 14.0, z0: -14.85, z1: 3.75, y: Y.attic },
  hut: { n: 12, name: 'Будка с мотором', x0: 1.3, x1: 3.7, z0: -15.2, z1: -12.6, y: Y.stab },
};

// openings: hatch above the hallway (ladder) and the stair hole above the feed room
export const HATCH = { x0: -8.3, x1: -7.5, z0: -4.35, z1: -3.55 };
export const STAIR = { x0: 10.0, x1: 10.95, z0: -7.95, z1: -4.95, y0: Y.stab, y1: Y.attic }; // rises towards +z (south)
export const CHIMNEY = { x0: -9.02, x1: -8.32, z0: -5.38, z1: -4.68, top: 8.75 };

// doors: hinge point, closed leaf direction yaw (local +x = leaf), swing sign, width, height; y0 = sill
// yaw 0: leaf runs +x; yaw PI/2: leaf runs -z. swing +1 turns +x towards -z.
const P2 = Math.PI / 2;
export const DOORS = [
  { id: 'd1', label: 'входную дверь', hinge: [-7.575, Y.live, -0.44], yaw: 0, swing: 1, w: 0.95, h: 2.0, ext: true , into: 'r3', back: 'дверь во двор' },
  { id: 'd2', label: 'дверь в комнату стариков', hinge: [-8.6, Y.live, -1.15], yaw: P2, swing: 1, w: 0.9, h: 1.95 , into: 'r1', back: 'дверь в сени' },
  { id: 'd3', label: 'дверь в комнату Виктории', hinge: [-5.6, Y.live, -1.15], yaw: P2, swing: -1, w: 0.9, h: 1.95 , into: 'r5', back: 'дверь в сени' },
  { id: 'd4', label: 'дверь на кухню', hinge: [-6.75, Y.live, -4.6], yaw: 0, swing: 1, w: 0.9, h: 1.95 , into: 'r4', back: 'дверь в сени' },
  { id: 'd5', label: 'дверь в комнату служанки', hinge: [-9.1, Y.live, -6.15], yaw: P2, swing: 1, w: 0.9, h: 1.95 , into: 'r2', back: 'дверь на кухню' },
  { id: 'd6', label: 'дверь в кладовую', hinge: [-3.6, Y.live, -6.75], yaw: P2, swing: -1, w: 0.85, h: 1.95 , into: 'r6', back: 'дверь на кухню' },
  { id: 'd7', label: 'дверь в хлев', hinge: [0.0, Y.live, -4.9], yaw: P2, swing: -1, w: 0.85, h: 1.9 , into: 'r7', back: 'дверь в кладовую' },
  { id: 'd8', label: 'северную дверь', hinge: [-5.65, Y.live, -8.16], yaw: 0, swing: 1, w: 0.9, h: 1.95, ext: true, locked: 'Северная дверь заколочена — за ней водопровод.' },
  { id: 'd9', label: 'дверь хлева', hinge: [4.45, Y.stab, -0.44], yaw: 0, swing: 1, w: 1.1, h: 2.1, ext: true , into: 'r7', back: 'дверь во двор' },
  { id: 'd10', label: 'дверь кормовой', hinge: [8.0, Y.stab, -4.6], yaw: 0, swing: -1, w: 0.85, h: 1.95 , into: 'r8', back: 'дверь в хлев' },
  { id: 'd11', label: 'узкую дверь в хлев', hinge: [11.225, Y.stab, -1.45], yaw: P2, swing: 1, w: 0.75, h: 1.9 , into: 'r7', back: 'дверь в гумно' },
  { id: 'd12a', label: 'ворота гумна', hinge: [12.45, Y.stab, 4.16], yaw: 0, swing: -1, w: 1.7, h: 3.4, ext: true, pair: 'd12b' },
  { id: 'd12b', label: 'ворота гумна', hinge: [15.85, Y.stab, 4.16], yaw: Math.PI, swing: 1, w: 1.7, h: 3.4, ext: true, pair: 'd12a' },
  { id: 'd13a', label: 'северные ворота', hinge: [12.45, Y.stab, -15.26], yaw: 0, swing: 1, w: 1.7, h: 3.4, ext: true, pair: 'd13b' },
  { id: 'd13b', label: 'северные ворота', hinge: [15.85, Y.stab, -15.26], yaw: Math.PI, swing: -1, w: 1.7, h: 3.4, ext: true, pair: 'd13a' },
  { id: 'd14', label: 'дверь хозяйственной комнаты', hinge: [16.92, Y.stab, -5.25], yaw: P2, swing: -1, w: 0.85, h: 1.95 , into: 'r10', back: 'дверь в гумно' },
  { id: 'd15', label: 'дверь машинного отделения', hinge: [16.92, Y.stab, -0.35], yaw: P2, swing: -1, w: 0.85, h: 1.95 , into: 'r11', back: 'дверь в гумно' },
  { id: 'd16', label: 'дверь будки', hinge: [4.0, Y.stab, -13.45], yaw: P2, swing: -1, w: 0.9, h: 1.9, ext: true, locked: 'Будка с мотором заперта на висячий замок.' },
];

// windows: wall S/N/W/E (house unless barn), centre along the wall, width, sill, head; kind: live | stable | knee
export const WINDOWS = [
  { wall: 'S', c: -12.4, w: 0.9, y0: 1.2, y1: 2.3, kind: 'live', room: 'r1' },
  { wall: 'S', c: -10.2, w: 0.9, y0: 1.2, y1: 2.3, kind: 'live', room: 'r1' },
  { wall: 'S', c: -4.2, w: 0.9, y0: 1.2, y1: 2.3, kind: 'live', room: 'r5' },
  { wall: 'S', c: -1.6, w: 0.9, y0: 1.2, y1: 2.3, kind: 'live', room: 'r5' },
  { wall: 'S', c: 2.4, w: 0.7, y0: 1.35, y1: 2.05, kind: 'stable', room: 'r7', chickens: true },
  { wall: 'S', c: 8.6, w: 0.8, y0: 1.35, y1: 2.05, kind: 'stable', room: 'r7' },
  { wall: 'S', c: -11.3, w: 0.55, y0: 3.3, y1: 3.72, kind: 'knee' },
  { wall: 'S', c: -3.0, w: 0.55, y0: 3.3, y1: 3.72, kind: 'knee' },
  { wall: 'S', c: 7.4, w: 0.55, y0: 3.3, y1: 3.72, kind: 'knee' },
  { wall: 'N', c: -11.3, w: 0.7, y0: 1.3, y1: 2.2, kind: 'live', room: 'r2' },
  { wall: 'N', c: -7.6, w: 0.8, y0: 1.3, y1: 2.2, kind: 'live', room: 'r4' },
  { wall: 'N', c: -1.9, w: 0.5, y0: 1.6, y1: 2.1, kind: 'stable', room: 'r6' },
  { wall: 'N', c: 2.8, w: 0.6, y0: 1.6, y1: 2.15, kind: 'stable', room: 'r7' },
  { wall: 'N', c: 5.6, w: 0.6, y0: 1.6, y1: 2.15, kind: 'stable', room: 'r7' },
  { wall: 'N', c: 9.0, w: 0.5, y0: 1.6, y1: 2.1, kind: 'stable', room: 'r8' },
  { wall: 'N', c: -5.6, w: 0.55, y0: 3.3, y1: 3.72, kind: 'knee' },
  { wall: 'N', c: 4.2, w: 0.55, y0: 3.3, y1: 3.72, kind: 'knee' },
  { wall: 'W', c: -2.5, w: 0.8, y0: 1.2, y1: 2.3, kind: 'live', room: 'r1' },
  { wall: 'W', c: -6.4, w: 0.7, y0: 1.3, y1: 2.2, kind: 'live', room: 'r2' },
  { wall: 'E', c: -5.6, w: 0.6, y0: 1.4, y1: 2.1, kind: 'stable', room: 'r10', barn: true },
  { wall: 'E', c: 1.2, w: 0.8, y0: 1.3, y1: 2.2, kind: 'stable', room: 'r11', barn: true },
];

// yard (outside) features
export const YARD = {
  shed: { x0: -19.5, x1: -13.8, z0: 3.6, z1: 9.0 }, // wagon shed, open to the east
  well: [-0.5, 7.4], kennel: [4.2, 8.2], pole: [7.6, 7.4], manure: { x0: 6.3, x1: 9.7, z0: 1.4, z1: 4.6 },
  sand: [-11.3, 1.9], cellar: { x0: -4.3, x1: -2.3, z0: 0.0, z1: 2.3 }, wood: [-7.4, 9.6], block: [-5.9, 8.9],
  fenceS: 15, fenceN: -11.5, fenceW: -23, fenceE: 24,
};

// spots for the viewer: position (feet), look-at, level (0 ground, 1 attic)
export const SPOTS = [
  { id: 'gate', label: 'Двор', pos: [17.5, 0, 21], look: [-2, 2.2, -4], lvl: 0 },
  { id: 'front', label: 'Фасад', pos: [-6.2, 0, 6.5], look: [-6.4, 1.8, -1], lvl: 0 },
  { id: 'r3', label: 'Сени', pos: [-7.0, Y.live, -0.9], look: [-6.6, 1.5, -6], lvl: 0 },
  { id: 'r4', label: 'Кухня', pos: [-4.5, Y.live, -5.4], look: [-8.6, 1.2, -6.4], lvl: 0 },
  { id: 'r1', label: 'Комната стариков', pos: [-9.3, Y.live, -1.0], look: [-13.5, 1.0, -3.4], lvl: 0 },
  { id: 'r5', label: 'Комната Виктории', pos: [-0.9, Y.live, -1.1], look: [-5, 1.0, -3.6], lvl: 0 },
  { id: 'r7', label: 'Хлев', pos: [9.8, Y.stab, -1.3], look: [2, 1.2, -6.5], lvl: 0 },
  { id: 'r8', label: 'Кормовая', pos: [8.2, Y.stab, -5.6], look: [10.6, 1.6, -7.6], lvl: 0 },
  { id: 'r9', label: 'Гумно', pos: [15.5, Y.stab, 3.0], look: [14.6, 1.8, -10], lvl: 0 },
  { id: 'attic', label: 'Чердак', pos: [-5.0, Y.attic, -4.3], look: [6, 3.6, -4.3], lvl: 1 },
  { id: 'nest', label: 'Гнездо в сене', pos: [13.4, Y.attic, -4.6], look: [12.3, 3.2, -7.8], lvl: 1 },
  { id: 'hut', label: 'Будка с мотором', pos: [7.5, 0, -11.5], look: [2.6, 1.2, -13.9], lvl: 0 },
];
