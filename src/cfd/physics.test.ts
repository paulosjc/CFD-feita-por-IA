/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Unit tests for OpenFOAM CFD Physics Calculations
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReynoldsNumber,
  classifyFlowRegime,
  calculateCourantNumber,
  calculateWallShearStress,
  calculateFrictionVelocity,
  calculateYPlus,
  calculateSkinFrictionCoefficient,
  calculateBoundaryLayerThickness,
  calculateAerodynamicCoefficients,
  calculateTotalPressure,
  calculateMixtureProperties,
  theoreticalPoiseuilleVelocity,
  calculateDarcyFrictionFactor,
  PRESET_FLUIDS,
} from './physics';

test('Reynolds number calculation and regime classification', () => {
  // Water: nu = 1.004e-6 m^2/s, U = 0.1 m/s, L = 0.05 m
  const re = calculateReynoldsNumber(0.1, 0.05, 1.004e-6);
  assert.ok(re > 4900 && re < 5000, `Expected Re around 4980, got ${re}`);

  // Test Laminar classification
  const laminar = classifyFlowRegime(1500, 'internal_pipe');
  assert.equal(laminar.regime, 'laminar');

  // Test Transitional classification
  const transitional = classifyFlowRegime(3000, 'internal_pipe');
  assert.equal(transitional.regime, 'transitional');

  // Test Turbulent classification
  const turbulent = classifyFlowRegime(8000, 'internal_pipe');
  assert.equal(turbulent.regime, 'turbulent');
});

test('Courant-Friedrichs-Lewy (CFL) stability condition', () => {
  const dx = 0.01;
  const dy = 0.01;
  const dt = 0.002;
  const u = 1.0;
  const v = 0.5;

  const cfl = calculateCourantNumber(u, v, dx, dy, dt);
  // cx = 1.0 * 0.002 / 0.01 = 0.2; cy = 0.5 * 0.002 / 0.01 = 0.1 => 0.3
  assert.ok(Math.abs(cfl.courantNumber - 0.3) < 1e-4);
  assert.equal(cfl.isStable, true);

  // Unstable timestep
  const unstableCfl = calculateCourantNumber(u, v, dx, dy, 0.02);
  assert.equal(unstableCfl.isStable, false);
});

test('Wall shear stress, friction velocity, y+ and skin friction', () => {
  const mu = 0.001; // Water
  const rho = 1000;
  const nu = 1e-6;
  const uNearWall = 0.05;
  const dy = 0.001; // 1mm

  const tau_w = calculateWallShearStress(uNearWall, dy, mu);
  assert.ok(Math.abs(tau_w - 0.05) < 1e-6, `Expected tau_w = 0.05, got ${tau_w}`);

  const u_tau = calculateFrictionVelocity(tau_w, rho);
  // u_tau = sqrt(0.05 / 1000) = sqrt(0.00005) ~= 0.007071
  assert.ok(Math.abs(u_tau - 0.007071) < 1e-4);

  const yPlus = calculateYPlus(dy, u_tau, nu);
  // y+ = (0.001 * 0.007071) / 1e-6 ~= 7.07
  assert.ok(Math.abs(yPlus - 7.07) < 0.1);

  const cf = calculateSkinFrictionCoefficient(tau_w, rho, 1.0);
  // cf = 0.05 / (0.5 * 1000 * 1^2) = 0.05 / 500 = 0.0001
  assert.ok(Math.abs(cf - 0.0001) < 1e-7);
});

test('Boundary layer growth formulas', () => {
  const x = 0.5;
  const reX = 1e5;
  const laminarBL = calculateBoundaryLayerThickness(x, reX, 'laminar');
  // delta = 5 * 0.5 / sqrt(100000) = 2.5 / 316.227 ~= 0.0079 m
  assert.ok(Math.abs(laminarBL.delta - 0.0079) < 0.001);
  assert.ok(laminarBL.shapeFactor > 2.5 && laminarBL.shapeFactor < 2.7);

  const turbulentBL = calculateBoundaryLayerThickness(x, reX, 'turbulent');
  assert.ok(turbulentBL.shapeFactor > 1.2 && turbulentBL.shapeFactor < 1.4);
});

test('Multiphase mixture calculations (Water + Air)', () => {
  const water = PRESET_FLUIDS.water;
  const air = PRESET_FLUIDS.air;

  // Pure water (alpha = 1)
  const pureWater = calculateMixtureProperties(1.0, water, air);
  assert.equal(pureWater.density, water.density);

  // Pure air (alpha = 0)
  const pureAir = calculateMixtureProperties(0.0, water, air);
  assert.equal(pureAir.density, air.density);

  // 50/50 mixture interface (alpha = 0.5)
  const mixture = calculateMixtureProperties(0.5, water, air);
  const expectedDensity = 0.5 * water.density + 0.5 * air.density;
  assert.ok(Math.abs(mixture.density - expectedDensity) < 1e-3);
});

test('Poiseuille velocity profile and Darcy friction factor', () => {
  const H = 0.1;
  const uMax = 2.0;

  // At walls (y=0 and y=H), velocity is 0
  assert.equal(theoreticalPoiseuilleVelocity(0, H, uMax), 0);
  assert.equal(theoreticalPoiseuilleVelocity(H, H, uMax), 0);

  // At centerline (y = H/2), velocity is uMax
  assert.ok(Math.abs(theoreticalPoiseuilleVelocity(H / 2, H, uMax) - uMax) < 1e-6);

  // Darcy friction for Re = 1000 -> 64 / 1000 = 0.064
  const fLaminar = calculateDarcyFrictionFactor(1000);
  assert.ok(Math.abs(fLaminar - 0.064) < 1e-4);
});
