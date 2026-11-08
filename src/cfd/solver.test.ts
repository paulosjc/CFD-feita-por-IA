/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Unit tests for OpenFOAM CFD Numerical Solver
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshGenerator } from './mesher';
import { CfdSolver } from './solver';

test('CfdSolver initializes correctly and executes simulation steps without NaN', () => {
  const mesh = new MeshGenerator({ nx: 30, ny: 20, lengthX: 1.0, lengthY: 1.0 });
  const solver = new CfdSolver(mesh, {
    inletVelocity: 1.0,
    timeStep: 0.005,
    poissonIterations: 10,
  });

  assert.equal(solver.iteration, 0);
  assert.equal(solver.currentSummary.iteration, 0);

  // Run 5 time steps
  for (let s = 0; s < 5; s++) {
    solver.step();
  }

  assert.equal(solver.iteration, 5);
  assert.ok(solver.currentSummary.maxVelocity >= 0);
  assert.ok(!isNaN(solver.currentSummary.maxVelocity), 'Velocity must not be NaN');
  assert.ok(!isNaN(solver.currentSummary.reynolds), 'Reynolds must not be NaN');
  assert.ok(solver.residuals.ux >= 0);
});

test('CfdSolver probeAt returns reasonable physical fields', () => {
  const mesh = new MeshGenerator({ nx: 30, ny: 20, lengthX: 2.0, lengthY: 1.0 });
  const solver = new CfdSolver(mesh, { inletVelocity: 2.0 });

  solver.step();

  const probe = solver.probeAt(1.0, 0.5);
  assert.equal(probe.x, 1.0);
  assert.equal(probe.y, 0.5);
  assert.ok(!isNaN(probe.velocityMagnitude));
  assert.ok(!isNaN(probe.pressure));
  assert.ok(!isNaN(probe.wallShearStress));
});

test('CfdSolver lid-driven cavity mode creates circulating flow', () => {
  const mesh = new MeshGenerator({ nx: 25, ny: 25, lengthX: 1.0, lengthY: 1.0 });
  const solver = new CfdSolver(mesh, {
    wallVelocity: 1.0,
    inletVelocity: 0.0,
    poissonIterations: 15,
  });

  // Run 10 steps
  for (let i = 0; i < 10; i++) {
    solver.step();
  }

  // Top boundary should have wall velocity
  const topProbe = solver.probeAt(0.5, 0.98);
  assert.ok(topProbe.u > 0.5, 'Near top wall, velocity should follow moving lid');
});
