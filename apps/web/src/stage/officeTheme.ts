import type { Theme } from '../core/theme';

const light = {
  floor: 0xeef1f4, floorStroke: 0xd0d7de, grid: 0x8c959f, gridAlphaH: 0.12, gridAlphaV: 0.09,
  work: 0xf8f9fb, workStroke: 0xd8dee4, lounge: 0xedf5f1, loungeStroke: 0xc9ded4, rug: 0xdcebe3,
  counter: 0xd0d7de, counterStroke: 0xafb8c1, machine: 0x424a53, machineStroke: 0x32383f, machineScreen: 0x54aeff,
  cup: 0xffffff, cupStroke: 0xafb8c1, coffeeTable: 0xd3e5dc, coffeeTableStroke: 0xa3c4b4,
  chair: 0xb7d3c5, chairStroke: 0x8fb5a3, loungeLabel: 0x4d6b5e,
  shadow: 0x1f2328, shadowAlpha: 0.08, charShadowAlpha: 0.14,
  pot: 0xc9d1d9, leaves: [0x6a9f88, 0x7bad96, 0x8cbba4],
  seatBack: 0x57606a, seatBackStroke: 0x424a53, seatInner: 0x6e7781,
  desk: 0xe6eaef, deskStroke: 0xafb8c1, apron: 0xd0d7de, apronStroke: 0xafb8c1, legs: 0x8c959f,
  monitor: 0x32383f, monitorStroke: 0x24292f, screen: 0x171b1c,
  keyboard: 0xffffff, keyboardStroke: 0xafb8c1, keys: 0xafb8c1, mouse: 0xffffff, notebook: 0x8c959f, mug: 0xffffff,
  plate: 0xffffff, plateStroke: 0xafb8c1, plateText: 0x1f2328,
  shelf: 0xddd6c9, shelfStroke: 0xb3a994, books: [0x9fb4c7, 0xc7a9a0, 0xa9bfa6, 0xc9bd94, 0xb3a7c9],
  board: 0xffffff, boardStroke: 0xafb8c1, notes: [0xfff1a8, 0xd4ecff, 0xffd8e4, 0xdaf5d6],
  clockFace: 0xffffff, clockStroke: 0x8c959f, clockHand: 0x424a53,
  printer: 0xe3e7eb, printerStroke: 0xafb8c1, paper: 0xffffff, led: 0x2da44e,
  cooler: 0xe3e7eb, coolerWater: 0xb6dcf5, sofa: 0xa9c7b8, sofaStroke: 0x86a898, cushion: 0xc4dccf,
  lampPole: 0x8c959f, lampShade: 0xf2e6c9, steam: 0x8c959f,
};

export type OfficePalette = typeof light;

const dark: OfficePalette = {
  floor: 0x2b2d31, floorStroke: 0x53565c, grid: 0xc4c7cd, gridAlphaH: 0.045, gridAlphaV: 0.035,
  work: 0x242629, workStroke: 0x3c3f44, lounge: 0x262c2b, loungeStroke: 0x3a4744, rug: 0x2d3533,
  counter: 0x4f5556, counterStroke: 0x5c6364, machine: 0x1b1e21, machineStroke: 0x4b5058, machineScreen: 0x3d6b7a,
  cup: 0x8b929b, cupStroke: 0x6b7280, coffeeTable: 0x4a5551, coffeeTableStroke: 0x5f6f69,
  chair: 0x45514d, chairStroke: 0x5f6f69, loungeLabel: 0x9fb3ab,
  shadow: 0x000000, shadowAlpha: 0.2, charShadowAlpha: 0.28,
  pot: 0x4b5058, leaves: [0x2c4f48, 0x35605a, 0x3e6e66],
  seatBack: 0x1b1d20, seatBackStroke: 0x4b5058, seatInner: 0x2c2f33,
  desk: 0x45494f, deskStroke: 0x737a83, apron: 0x2a2d31, apronStroke: 0x4b5058, legs: 0x3c4148,
  monitor: 0x0f172a, monitorStroke: 0x4b5058, screen: 0x171b1c,
  keyboard: 0x272a2e, keyboardStroke: 0x3a3d42, keys: 0x6b7280, mouse: 0x6b7280, notebook: 0x26292d, mug: 0x5b6169,
  plate: 0x1d1f22, plateStroke: 0x555c65, plateText: 0xe1e4e9,
  shelf: 0x3a3631, shelfStroke: 0x57514a, books: [0x4a5d70, 0x6b4f4a, 0x4d6250, 0x6b6247, 0x5a5070],
  board: 0x33363b, boardStroke: 0x4b5058, notes: [0x6b6340, 0x3e5468, 0x6b4655, 0x46604a],
  clockFace: 0x2a2d31, clockStroke: 0x5c6370, clockHand: 0xc4c7cd,
  printer: 0x3c4148, printerStroke: 0x5c6370, paper: 0xc9d1d9, led: 0x3fb950,
  cooler: 0x3c4148, coolerWater: 0x3d6b7a, sofa: 0x3e4a46, sofaStroke: 0x56645f, cushion: 0x4a5853,
  lampPole: 0x5c6370, lampShade: 0x6b6450, steam: 0xc4c7cd,
};

export const officePalette = (theme: Theme): OfficePalette => (theme === 'dark' ? dark : light);
