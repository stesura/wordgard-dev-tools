import {startBridge} from "../src/bridge.ts"

// Injected by the background into the inspected tab's frames while the panel is open.
export default defineUnlistedScript(() => startBridge())
