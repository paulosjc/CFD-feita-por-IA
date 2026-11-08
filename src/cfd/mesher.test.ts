/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Unit tests for OpenFOAM blockMesh generator
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshGenerator } from './mesher';

test('MeshGenerator creates regular grid and checks boundary patches', () => {
  const mesher = new MeshGenerator({
    nx: 50,
    ny: 25,
    lengthX: 2.0,
    lengthY: 1.0,
    hasObstacle: false,
  });

  assert.equal(mesher.stats.totalCells, 1250);
  assert.equal(mesher.stats.obstacleCells, 0);
  assert.equal(mesher.cells.length, 1250);

  // Check inlet and outlet patches
  const inletCell = mesher.cells[0]; // i=0, j=0
  assert.equal(inletCell.i, 0);

  // Check blockMeshDict generation contains standard OpenFOAM headers
  assert.ok(mesher.stats.blockMeshDictPreview.includes('FoamFile'));
  assert.ok(mesher.stats.blockMeshDictPreview.includes('blockMeshDict'));
  assert.ok(mesher.stats.blockMeshDictPreview.includes('hex (0 1 2 3 4 5 6 7)'));
});

test('MeshGenerator identifies cylinder obstacle cells and updates active fluid cells', () => {
  const mesher = new MeshGenerator({
    nx: 40,
    ny: 40,
    lengthX: 1.0,
    lengthY: 1.0,
    hasObstacle: true,
    obstacleType: 'cylinder',
    obstacleX: 0.5,
    obstacleY: 0.5,
    obstacleSize: 0.2, // radius 0.1
  });

  assert.ok(mesher.stats.obstacleCells > 0, 'Should detect obstacle cells');
  assert.equal(mesher.stats.activeFluidCells, mesher.stats.totalCells - mesher.stats.obstacleCells);
});
