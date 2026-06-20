import {
  createPlayerSystemDemoManifest,
  defaultPlayerSystemDemoScenarioCatalog,
  packageDescriptor,
} from "../dist/index.js";

const manifest = createPlayerSystemDemoManifest(
  defaultPlayerSystemDemoScenarioCatalog.slice(0, 6)
);

console.log(packageDescriptor);
console.log(manifest);
