/** TEMPORARY: print each room's placement and world extent. */
import { STATION } from '../src/env/station/plan';
import { layOut, worldExtent } from '../src/env/station/layout';

const placed = layOut(STATION.rooms, STATION.connections, STATION.anchor);
for (const room of STATION.rooms) {
  const p = placed.get(room.id);
  if (!p) continue;
  const box = worldExtent(room, p);
  console.log(
    `${room.id.padEnd(10)} yaw ${((p.yaw * 180) / Math.PI).toFixed(0).padStart(4)}  ` +
      `pos (${p.position.x.toFixed(2)}, ${p.position.z.toFixed(2)})  ` +
      `x [${box.min.x.toFixed(2)}, ${box.max.x.toFixed(2)}]  z [${box.min.z.toFixed(2)}, ${box.max.z.toFixed(2)}]  y [${box.min.y.toFixed(2)}, ${box.max.y.toFixed(2)}]`
  );
}
