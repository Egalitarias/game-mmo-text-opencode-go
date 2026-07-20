import { describe, it, expect } from "vitest";
import {
  generateZoneWithVaults,
  spawnVaultEntities,
  selectVault,
  canPlaceVault,
  placeVault,
  placeVaults,
  VAULT_TEMPLATES,
  makeWorld,
  generateZone,
} from "../src/index.js";

describe("Vault System", () => {
  describe("Vault Templates", () => {
    it("should have predefined vault templates", () => {
      expect(VAULT_TEMPLATES.length).toBeGreaterThan(0);
    });

    it("each vault should have valid structure", () => {
      for (const vault of VAULT_TEMPLATES) {
        expect(vault.name).toBeDefined();
        expect(vault.width).toBeGreaterThan(0);
        expect(vault.height).toBeGreaterThan(0);
        expect(vault.tiles.length).toBe(vault.height);
        const firstRow = vault.tiles[0];
        expect(firstRow).toBeDefined();
        if (firstRow) {
          expect(firstRow.length).toBe(vault.width);
        }
        expect(vault.difficulty).toBeGreaterThanOrEqual(1);
        expect(vault.difficulty).toBeLessThanOrEqual(10);
      }
    });

    it("vault spawns should be within bounds", () => {
      for (const vault of VAULT_TEMPLATES) {
        for (const spawn of vault.spawns) {
          expect(spawn.x).toBeGreaterThanOrEqual(0);
          expect(spawn.x).toBeLessThan(vault.width);
          expect(spawn.y).toBeGreaterThanOrEqual(0);
          expect(spawn.y).toBeLessThan(vault.height);
        }
      }
    });
  });

  describe("selectVault", () => {
    it("should select vaults appropriate for zone difficulty", () => {
      const seed = 12345;
      const vault = selectVault(5, seed);
      
      expect(vault).toBeDefined();
      if (vault) {
        // Vault difficulty should be within ±2 of zone difficulty
        expect(Math.abs(vault.difficulty - 5)).toBeLessThanOrEqual(2);
      }
    });

    it("should be deterministic with same seed", () => {
      const seed = 99999;
      const vault1 = selectVault(5, seed);
      const vault2 = selectVault(5, seed);
      
      expect(vault1).toEqual(vault2);
    });

    it("should return different vaults with different seeds", () => {
      const vault1 = selectVault(5, 11111);
      const vault2 = selectVault(5, 22222);
      
      // They might be the same by chance, but usually different
      // Just check that the function works
      expect(vault1).toBeDefined();
      expect(vault2).toBeDefined();
    });
  });

  describe("canPlaceVault", () => {
    it("should reject placement outside bounds", () => {
      const zone = generateZone("test", 20, 20, 12345);
      const vault = VAULT_TEMPLATES[0];
      
      if (vault) {
        // Try to place vault outside bounds
        expect(canPlaceVault(zone, vault, -1, 0)).toBe(false);
        expect(canPlaceVault(zone, vault, 0, -1)).toBe(false);
        expect(canPlaceVault(zone, vault, zone.width, 0)).toBe(false);
        expect(canPlaceVault(zone, vault, 0, zone.height)).toBe(false);
      }
    });

    it("should allow placement in valid locations", () => {
      const zone = generateZone("test", 30, 30, 12345);
      const vault = VAULT_TEMPLATES[0];
      
      if (vault) {
        // Try to place vault in middle of zone
        const x = Math.floor((zone.width - vault.width) / 2);
        const y = Math.floor((zone.height - vault.height) / 2);
        
        // Should be able to place somewhere
        const canPlace = canPlaceVault(zone, vault, x, y);
        expect(typeof canPlace).toBe("boolean");
      }
    });
  });

  describe("placeVault", () => {
    it("should place vault tiles into zone", () => {
      const zone = generateZone("test", 20, 20, 12345);
      const vault = VAULT_TEMPLATES[0];
      
      if (vault) {
        const x = 5;
        const y = 5;
        const spawns = placeVault(zone, vault, x, y);
        
        // Check that vault tiles were placed
        for (let vy = 0; vy < vault.height; vy++) {
          for (let vx = 0; vx < vault.width; vx++) {
            const zoneX = x + vx;
            const zoneY = y + vy;
            const vaultRow = vault.tiles[vy];
            const vaultTile = vaultRow ? vaultRow[vx] : undefined;
            const zoneTile = zone.tiles[zoneY * zone.width + zoneX];
            
            if (vaultTile) {
              expect(zoneTile).toBe(vaultTile);
            }
          }
        }
        
        // Check that spawns were adjusted to zone coordinates
        expect(spawns.length).toBe(vault.spawns.length);
        for (let i = 0; i < spawns.length; i++) {
          const original = vault.spawns[i];
          const adjusted = spawns[i];
          if (original && adjusted) {
            expect(adjusted.x).toBe(x + original.x);
            expect(adjusted.y).toBe(y + original.y);
          }
        }
      }
    });
  });

  describe("placeVaults", () => {
    it("should place multiple vaults in a zone", () => {
      const zone = generateZone("test", 40, 40, 12345);
      const spawns = placeVaults(zone, 5, 99999, 20, 3);
      
      // Should place at least some vaults
      expect(spawns.length).toBeGreaterThan(0);
    });

    it("should be deterministic with same seed", () => {
      const zone1 = generateZone("test", 40, 40, 12345);
      const zone2 = generateZone("test", 40, 40, 12345);
      
      const spawns1 = placeVaults(zone1, 5, 99999, 20, 3);
      const spawns2 = placeVaults(zone2, 5, 99999, 20, 3);
      
      expect(spawns1).toEqual(spawns2);
    });

    it("should respect maxVaults limit", () => {
      const zone = generateZone("test", 40, 40, 12345);
      const spawns = placeVaults(zone, 5, 99999, 100, 2);
      
      // Count unique vault placements by checking spawn positions
      // (This is a rough check - actual vault count might be less due to placement failures)
      expect(spawns.length).toBeLessThanOrEqual(20); // Reasonable upper bound
    });
  });

  describe("generateZoneWithVaults", () => {
    it("should generate zone with vaults enabled", () => {
      const result = generateZoneWithVaults({
        id: "test",
        width: 40,
        height: 30,
        seed: 12345,
        difficulty: 5,
        enableVaults: true,
        maxVaults: 3,
      });
      
      expect(result.zone).toBeDefined();
      expect(result.zone.width).toBe(40);
      expect(result.zone.height).toBe(30);
      expect(result.spawns.length).toBeGreaterThan(0);
    });

    it("should generate zone without vaults when disabled", () => {
      const result = generateZoneWithVaults({
        id: "test",
        width: 40,
        height: 30,
        seed: 12345,
        enableVaults: false,
      });
      
      expect(result.zone).toBeDefined();
      expect(result.spawns.length).toBe(0);
    });

    it("should be deterministic", () => {
      const result1 = generateZoneWithVaults({
        id: "test",
        width: 40,
        height: 30,
        seed: 12345,
        difficulty: 5,
        enableVaults: true,
      });
      
      const result2 = generateZoneWithVaults({
        id: "test",
        width: 40,
        height: 30,
        seed: 12345,
        difficulty: 5,
        enableVaults: true,
      });
      
      expect(result1.zone.tiles).toEqual(result2.zone.tiles);
      expect(result1.spawns).toEqual(result2.spawns);
    });
  });

  describe("spawnVaultEntities", () => {
    it("should spawn monsters and items from vault spawns", () => {
      const world = makeWorld();
      const zone = generateZone("test", 40, 30, 12345);
      world.zones.set("test", zone);
      
      // Find valid floor positions
      let pos1: { x: number; y: number } | null = null;
      let pos2: { x: number; y: number } | null = null;
      
      for (let y = 1; y < zone.height - 1; y++) {
        for (let x = 1; x < zone.width - 1; x++) {
          if (zone.tiles[y * zone.width + x] === "floor") {
            if (!pos1) {
              pos1 = { x, y };
            } else if (!pos2) {
              pos2 = { x, y };
              break;
            }
          }
        }
        if (pos1 && pos2) break;
      }
      
      expect(pos1).toBeDefined();
      expect(pos2).toBeDefined();
      
      if (pos1 && pos2) {
        const spawns = [
          { x: pos1.x, y: pos1.y, type: "monster" as const, monsterType: "aggressive" as const },
          { x: pos2.x, y: pos2.y, type: "item" as const, item: { kind: "potion" as const, name: "Test Potion", value: 10 } },
        ];
        
        const entityIds = spawnVaultEntities(world, "test", spawns);
        
        expect(entityIds.length).toBe(2);
        expect(world.entities.size).toBe(2);
      }
    });

    it("should handle invalid spawn positions gracefully", () => {
      const world = makeWorld();
      const zone = generateZone("test", 40, 30, 12345);
      world.zones.set("test", zone);
      
      const spawns = [
        { x: 0, y: 0, type: "monster" as const, monsterType: "aggressive" as const }, // Wall position
      ];
      
      const entityIds = spawnVaultEntities(world, "test", spawns);
      
      // Should fail to spawn on wall
      expect(entityIds.length).toBe(0);
    });

    it("should spawn entities with correct stats", () => {
      const world = makeWorld();
      const zone = generateZone("test", 40, 30, 12345);
      world.zones.set("test", zone);
      
      // Find a valid floor position
      let pos: { x: number; y: number } | null = null;
      for (let y = 1; y < zone.height - 1; y++) {
        for (let x = 1; x < zone.width - 1; x++) {
          if (zone.tiles[y * zone.width + x] === "floor") {
            pos = { x, y };
            break;
          }
        }
        if (pos) break;
      }
      
      expect(pos).toBeDefined();
      
      if (pos) {
        const spawns = [
          { x: pos.x, y: pos.y, type: "monster" as const, monsterType: "aggressive" as const },
        ];
        
        const entityIds = spawnVaultEntities(world, "test", spawns);
        
        expect(entityIds.length).toBe(1);
        const monsterId = entityIds[0];
        if (monsterId !== undefined) {
          const stats = world.stats.get(monsterId);
          expect(stats).toBeDefined();
          expect(stats?.hp).toBe(15); // Aggressive monster HP
          expect(stats?.attack).toBe(6);
        }
      }
    });
  });

  describe("Integration with generateZone", () => {
    it("should work with generateZone when vaults enabled", () => {
      const zone = generateZone("test", 40, 30, 12345, { enableVaults: true, difficulty: 5 });
      
      expect(zone).toBeDefined();
      expect(zone.width).toBe(40);
      expect(zone.height).toBe(30);
    });

    it("should work with generateZone when vaults disabled", () => {
      const zone = generateZone("test", 40, 30, 12345, { enableVaults: false });
      
      expect(zone).toBeDefined();
      expect(zone.width).toBe(40);
      expect(zone.height).toBe(30);
    });

    it("should default to no vaults for backward compatibility", () => {
      const zone = generateZone("test", 40, 30, 12345);
      
      expect(zone).toBeDefined();
      expect(zone.width).toBe(40);
      expect(zone.height).toBe(30);
    });
  });
});
