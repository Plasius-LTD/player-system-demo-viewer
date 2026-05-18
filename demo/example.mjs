import { createPlayerSystemDemoManifest, packageDescriptor } from "../dist/index.js";

const manifest = createPlayerSystemDemoManifest([
  { scenarioId: "awakening", title: "Awakening" },
  { scenarioId: "points-ledgers", title: "Points Ledgers" },
]);

console.log(packageDescriptor);
console.log(manifest);
