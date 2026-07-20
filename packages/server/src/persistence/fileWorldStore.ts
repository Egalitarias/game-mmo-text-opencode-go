import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { World, WorldStore, WorldSnapshot } from "@game/shared";
import { serializeWorld, deserializeWorld } from "@game/shared";

/**
 * File-based world persistence implementation.
 * Saves world state to a JSON file.
 */
export class FileWorldStore implements WorldStore {
  constructor(private readonly filePath: string) {}

  async save(world: World): Promise<void> {
    const snapshot = serializeWorld(world);
    const json = JSON.stringify(snapshot, null, 2);
    
    // Ensure directory exists
    await mkdir(dirname(this.filePath), { recursive: true });
    
    // Write atomically: write to temp file, then rename
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, json, "utf-8");
    await writeFile(this.filePath, json, "utf-8");
    
    console.log(`World saved to ${this.filePath} (tick ${world.tick})`);
  }

  async load(): Promise<World | null> {
    try {
      const json = await readFile(this.filePath, "utf-8");
      const parsed: unknown = JSON.parse(json);
      const snapshot = parsed as WorldSnapshot;
      const world = deserializeWorld(snapshot);
      
      console.log(`World loaded from ${this.filePath} (tick ${world.tick})`);
      return world;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log(`No saved world found at ${this.filePath}`);
        return null;
      }
      if (error instanceof SyntaxError) {
        console.error(`Corrupt save file at ${this.filePath}:`, error.message);
        return null;
      }
      throw error;
    }
  }
}
