import * as W from './game-wire.mjs';
// Synthetic, minimal inspection fixture. Never presented as an importable game.
export function demoFile() {
  const typed=(type,payload)=>W.concat([W.field(1,0,type),W.field(2,2,W.concat([W.field(1,0,type),W.field(2,2,W.EMPTY)])),W.field(type+10,2,payload)]);
  const variable=(name,type,payload)=>W.field(1,2,W.concat([W.field(2,2,W.utf8(name)),W.field(3,0,type),W.field(4,2,typed(type,payload)),W.field(5,0,1)]));
  const named=(name)=>W.concat([W.field(1,0,1),W.field(11,2,W.field(1,2,W.utf8(name)))]);
  const data=W.concat([
    variable('Weapon names',11,W.concat(['Pyro Rifle','Electro SMG','Geo Shotgun','Hydro Nader','Cryo Sniper'].map(s=>W.field(1,2,W.utf8(s))))),
    variable('Magazine sizes',8,W.field(1,2,W.concat([30,40,6,8,5].map(W.varint)))),
    variable('Round scores',8,W.field(1,2,W.concat([0,0].map(W.varint)))),
    variable('Friendly fire',4,W.field(1,0,0)),
    variable('Round duration',5,W.field(1,5,W.floatBytes(180)))
  ]);
  const scene=W.concat([W.field(1,0,1001),W.field(2,2,W.field(1,0,10003004)),W.field(5,2,named('Example stage')),W.field(7,2,W.concat([W.field(1,0,1),W.field(11,2,data)])),W.field(8,0,10003004)]);
  const prefab=W.concat([W.field(1,0,2001),W.field(2,0,1000000),W.field(6,2,named('Example weapon stand')),W.field(8,2,W.concat([W.field(1,0,1),W.field(11,2,data)]))]);
  return W.pack(W.concat([W.field(2,2,W.utf8('Example workspace — synthetic data')),W.field(4,2,W.field(1,2,prefab)),W.field(5,2,W.field(1,2,scene)),W.field(49,2,W.utf8('Opaque data stays intact.'))]));
}
