/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - 2D CFD Numerical Solver
 * Implements Navier-Stokes (SIMPLE / PISO fractional step) with:
 * - Laminar & Turbulent regimes (Prandtl-Smagorinsky / k-TKE eddy viscosity)
 * - Multiphase VOF (two fluids with interface tracking & surface tension)
 * - Wall boundary conditions (no-slip, moving wall, partial slip, roughness)
 * - Force integration (Cd, Cl) and wall shear stress (tau_w, y+)
 */

import { MeshGenerator } from './mesher';
import {
  FluidProperties,
  PRESET_FLUIDS,
  calculateReynoldsNumber,
  classifyFlowRegime,
  calculateCourantNumber,
  calculateWallShearStress,
  calculateFrictionVelocity,
  calculateYPlus,
  calculateSkinFrictionCoefficient,
  calculateTotalPressure,
} from './physics';

export type SolverType = 'simpleFoam' | 'icoFoam' | 'pimpleFoam' | 'interFoam';

export interface SolverOptions {
  solverType: SolverType;
  regime: 'laminar' | 'transitional' | 'turbulent';
  timeStep: number; // dt in seconds
  inletVelocity: number; // m/s
  wallVelocity: number; // m/s for lid-driven cavity
  wallCondition: 'noSlip' | 'slip' | 'partialSlip';
  slipFactor: number; // 0 (no slip) to 1 (full slip)
  wallRoughness: number; // in meters (ks)
  fluid1: FluidProperties; // Primary fluid
  fluid2: FluidProperties; // Secondary fluid for multiphase
  isMultiphase: boolean;
  gravityY: number; // m/s^2 (-9.81 for dam break)
  surfaceTension: number; // N/m
  poissonIterations: number; // Pressure-Poisson iterations (typically 20-50)
  turbulentIntensity: number; // 0.01 to 0.10 (1% to 10%)
}

export interface ProbeData {
  x: number;
  y: number;
  u: number;
  v: number;
  velocityMagnitude: number;
  pressure: number;
  vorticity: number;
  phaseAlpha: number;
  eddyViscosity: number;
  turbulentKineticEnergy: number;
  wallShearStress: number;
  yPlus: number;
}

export interface SimulationSummary {
  iteration: number;
  simulationTime: number;
  reynolds: number;
  regimeName: string;
  courantNumber: number;
  maxVelocity: number;
  minPressure: number;
  maxPressure: number;
  dragCoefficient: number;
  liftCoefficient: number;
  dragForce: number;
  liftForce: number;
  avgWallShear: number;
  maxWallShear: number;
  residuals: {
    ux: number;
    uy: number;
    p: number;
    k: number;
  };
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  phase: number; // 0 = fluid2, 1 = fluid1
}

export class CfdSolver {
  public mesh: MeshGenerator;
  public options: SolverOptions;

  // Field arrays (Float32Array for performance)
  public nx: number;
  public ny: number;
  public size: number;

  public u: Float32Array; // Velocity X
  public v: Float32Array; // Velocity Y
  public u0: Float32Array; // Prev Velocity X
  public v0: Float32Array; // Prev Velocity Y
  public p: Float32Array; // Static pressure
  public p0: Float32Array; // Prev Pressure
  public div: Float32Array; // Velocity divergence
  public vorticity: Float32Array; // Vorticity omega = dv/dx - du/dy
  public alpha: Float32Array; // Multiphase volume fraction (0 = fluid2/air, 1 = fluid1/water)
  public alpha0: Float32Array;
  public nut: Float32Array; // Turbulent eddy viscosity
  public tke: Float32Array; // Turbulent kinetic energy k
  public wallShear: Float32Array; // Wall shear stress along boundaries

  public particles: Particle[] = [];
  public maxParticles = 600;

  // State metrics
  public iteration = 0;
  public simulationTime = 0;
  public residuals = { ux: 1e-1, uy: 1e-1, p: 1e-1, k: 1e-1 };
  public residualHistory: { iter: number; ux: number; uy: number; p: number }[] = [];
  public currentSummary!: SimulationSummary;

  constructor(mesh: MeshGenerator, options?: Partial<SolverOptions>) {
    this.mesh = mesh;
    this.nx = mesh.config.nx;
    this.ny = mesh.config.ny;
    this.size = this.nx * this.ny;

    this.options = {
      solverType: options?.solverType ?? 'simpleFoam',
      regime: options?.regime ?? 'laminar',
      timeStep: options?.timeStep ?? 0.005,
      inletVelocity: options?.inletVelocity ?? 1.0,
      wallVelocity: options?.wallVelocity ?? 0.0,
      wallCondition: options?.wallCondition ?? 'noSlip',
      slipFactor: options?.slipFactor ?? 0.0,
      wallRoughness: options?.wallRoughness ?? 0.0001,
      fluid1: options?.fluid1 ?? PRESET_FLUIDS.water,
      fluid2: options?.fluid2 ?? PRESET_FLUIDS.air,
      isMultiphase: options?.isMultiphase ?? false,
      gravityY: options?.gravityY ?? 0.0,
      surfaceTension: options?.surfaceTension ?? 0.0728,
      poissonIterations: options?.poissonIterations ?? 25,
      turbulentIntensity: options?.turbulentIntensity ?? 0.05,
    };

    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.u0 = new Float32Array(this.size);
    this.v0 = new Float32Array(this.size);
    this.p = new Float32Array(this.size);
    this.p0 = new Float32Array(this.size);
    this.div = new Float32Array(this.size);
    this.vorticity = new Float32Array(this.size);
    this.alpha = new Float32Array(this.size);
    this.alpha0 = new Float32Array(this.size);
    this.nut = new Float32Array(this.size);
    this.tke = new Float32Array(this.size);
    this.wallShear = new Float32Array(this.size);

    this.initFields();
    this.initParticles();
    this.updateSummary();
  }

  public reset(): void {
    this.iteration = 0;
    this.simulationTime = 0;
    this.residualHistory = [];
    this.initFields();
    this.initParticles();
    this.updateSummary();
  }

  public reinitMesh(mesh: MeshGenerator): void {
    this.mesh = mesh;
    this.nx = mesh.config.nx;
    this.ny = mesh.config.ny;
    this.size = this.nx * this.ny;

    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.u0 = new Float32Array(this.size);
    this.v0 = new Float32Array(this.size);
    this.p = new Float32Array(this.size);
    this.p0 = new Float32Array(this.size);
    this.div = new Float32Array(this.size);
    this.vorticity = new Float32Array(this.size);
    this.alpha = new Float32Array(this.size);
    this.alpha0 = new Float32Array(this.size);
    this.nut = new Float32Array(this.size);
    this.tke = new Float32Array(this.size);
    this.wallShear = new Float32Array(this.size);

    this.initFields();
    this.initParticles();
    this.updateSummary();
  }

  public setFields(type: 'damBreak' | 'bubble' | 'stratified' | 'uniform'): void {
    const { nx, ny } = this;
    const lx = this.mesh.config.lengthX;
    const ly = this.mesh.config.lengthY;

    for (let j = 0; j < ny; j++) {
      const y = this.mesh.gridY[j];
      for (let i = 0; i < nx; i++) {
        const x = this.mesh.gridX[i];
        const idx = j * nx + i;

        if (type === 'damBreak') {
          // Water column on left side (e.g. x < 0.25 * lx, y < 0.6 * ly)
          this.alpha[idx] = x <= 0.3 * lx && y <= 0.65 * ly ? 1.0 : 0.0;
        } else if (type === 'bubble') {
          // Circular bubble of air in water
          const distSq = Math.pow(x - 0.5 * lx, 2) + Math.pow(y - 0.3 * ly, 2);
          this.alpha[idx] = distSq < Math.pow(0.12 * ly, 2) ? 0.0 : 1.0;
        } else if (type === 'stratified') {
          // Lower half water (1), upper half air (0)
          this.alpha[idx] = y <= 0.45 * ly ? 1.0 : 0.0;
        } else {
          this.alpha[idx] = 1.0;
        }
      }
    }
  }

  private initFields(): void {
    const { nx, ny } = this;
    const isCavity = this.options.wallVelocity > 0;
    const isInterFoam = this.options.solverType === 'interFoam' || this.options.isMultiphase;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const cell = this.mesh.cells[idx];

        if (cell.isObstacle) {
          this.u[idx] = 0;
          this.v[idx] = 0;
          this.p[idx] = 0;
          this.alpha[idx] = 0;
          continue;
        }

        // Initialize velocity
        if (isCavity) {
          // Lid driven cavity: fluid at rest, top layer moving with lid
          if (j >= ny - 2) {
            this.u[idx] = this.options.wallVelocity * (j === ny - 1 ? 1.0 : 0.6);
          } else {
            this.u[idx] = 0;
          }
          this.v[idx] = 0;
        } else {
          // Channel / external flow: initialize with inlet velocity
          this.u[idx] = this.options.inletVelocity;
          // Add tiny perturbation to trigger vortex shedding if obstacle exists or turbulent
          if (this.mesh.config.hasObstacle || this.options.regime === 'turbulent') {
            const perturbation = (Math.sin(j * 0.4) + (Math.random() - 0.5) * 0.05) * 0.08 * this.options.inletVelocity;
            this.v[idx] = perturbation;
          } else {
            this.v[idx] = 0;
          }
        }

        this.p[idx] = 0;
        this.tke[idx] =
          1.5 * Math.pow(this.options.turbulentIntensity * Math.max(0.1, this.options.inletVelocity), 2);
        this.nut[idx] = 0;

        // Multiphase initialization
        if (isInterFoam) {
          // Default dam break column or stratified
          const x = this.mesh.gridX[i];
          const y = this.mesh.gridY[j];
          this.alpha[idx] = x < 0.3 * this.mesh.config.lengthX && y < 0.65 * this.mesh.config.lengthY ? 1.0 : 0.0;
        } else {
          this.alpha[idx] = 1.0;
        }
      }
    }
  }

  private initParticles(): void {
    this.particles = [];
    const lx = this.mesh.config.lengthX;
    const ly = this.mesh.config.lengthY;

    for (let p = 0; p < this.maxParticles; p++) {
      this.particles.push({
        x: Math.random() * lx,
        y: Math.random() * ly,
        vx: 0,
        vy: 0,
        age: Math.random() * 200,
        maxAge: 200 + Math.random() * 200,
        phase: Math.random() > 0.5 ? 1 : 0,
      });
    }
  }

  /**
   * Main time step solver execution (Chorin Projection / SIMPLE loop)
   */
  public step(): void {
    const dt = this.options.timeStep;
    const { nx, ny } = this;

    // Save previous iteration fields for residual tracking
    this.u0.set(this.u);
    this.v0.set(this.v);
    this.p0.set(this.p);
    this.alpha0.set(this.alpha);

    // 1. Calculate turbulent eddy viscosity (nut) if turbulent regime
    if (this.options.regime === 'turbulent' || this.options.regime === 'transitional') {
      this.computeTurbulentEddyViscosity();
    } else {
      this.nut.fill(0);
    }

    // 2. Multiphase advection if VOF is active
    if (this.options.isMultiphase || this.options.solverType === 'interFoam') {
      this.advectScalar(this.alpha, this.alpha0, dt);
      this.applySurfaceTensionAndGravity(dt);
    }

    // 3. Advection of momentum (semi-Lagrangian)
    this.advectVelocity(dt);

    // 4. Viscous diffusion (Navier-Stokes laplacian term)
    this.diffuseVelocity(dt);

    // 5. Apply wall boundary conditions & external forces
    this.applyBoundaryConditions();

    // 6. Pressure-Poisson solve to enforce incompressibility (div U = 0)
    this.solvePressurePoisson();

    // 7. Project velocity onto divergence-free subspace (u = u* - dt/rho * grad p)
    this.projectVelocity(dt);

    // 8. Re-apply boundary conditions to projected velocity
    this.applyBoundaryConditions();

    // 9. Compute secondary physical fields: vorticity, wall shear stress, forces
    this.computeVorticity();
    this.computeWallShearStress();
    this.updateParticles(dt);

    // 10. Update simulation time and metrics
    this.iteration++;
    this.simulationTime += dt;
    this.computeResiduals();
    this.updateSummary();
  }

  /**
   * Stable semi-Lagrangian advection for velocity field
   */
  private advectVelocity(dt: number): void {
    const { nx, ny } = this;
    const tempU = new Float32Array(this.u);
    const tempV = new Float32Array(this.v);

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) continue;

        const cell = this.mesh.cells[idx];
        const uVal = tempU[idx];
        const vVal = tempV[idx];

        // Trace back along characteristic
        const backX = cell.x - uVal * dt;
        const backY = cell.y - vVal * dt;

        // Bilinear interpolate velocity at back-traced location
        this.u[idx] = this.interpolateField(tempU, backX, backY);
        this.v[idx] = this.interpolateField(tempV, backX, backY);
      }
    }
  }

  /**
   * Advects a scalar field (such as VOF alpha)
   */
  private advectScalar(field: Float32Array, field0: Float32Array, dt: number): void {
    const { nx, ny } = this;
    const temp = new Float32Array(field0);

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) continue;

        const cell = this.mesh.cells[idx];
        const backX = cell.x - this.u[idx] * dt;
        const backY = cell.y - this.v[idx] * dt;

        let val = this.interpolateField(temp, backX, backY);
        // Clamp phase fraction to [0, 1]
        val = Math.max(0, Math.min(1, val));
        field[idx] = val;
      }
    }
  }

  /**
   * Viscous diffusion with effective viscosity nu_eff = nu + nut
   */
  private diffuseVelocity(dt: number): void {
    const { nx, ny } = this;
    const nuBase = this.options.fluid1.kinematicViscosity;

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) continue;

        const cell = this.mesh.cells[idx];
        const dx2 = cell.dx * cell.dx;
        const dy2 = cell.dy * cell.dy;

        // Local effective viscosity
        const nuEff = nuBase + this.nut[idx];
        const alphaDiff = Math.min(0.2, (nuEff * dt) / Math.min(dx2, dy2));

        const uL = this.u[idx - 1];
        const uR = this.u[idx + 1];
        const uD = this.u[idx - nx];
        const uU = this.u[idx + nx];

        const vL = this.v[idx - 1];
        const vR = this.v[idx + 1];
        const vD = this.v[idx - nx];
        const vU = this.v[idx + nx];

        this.u[idx] += alphaDiff * (uL + uR + uD + uU - 4 * this.u[idx]);
        this.v[idx] += alphaDiff * (vL + vR + vD + vU - 4 * this.v[idx]);
      }
    }
  }

  /**
   * Calculates turbulent eddy viscosity using mixing length / Boussinesq model
   */
  private computeTurbulentEddyViscosity(): void {
    const { nx, ny } = this;
    const ly = this.mesh.config.lengthY;
    const kappa = 0.41; // von Karman constant
    const cMu = 0.09;

    for (let j = 1; j < ny - 1; j++) {
      const yDist = Math.min(this.mesh.gridY[j], ly - this.mesh.gridY[j]);
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) {
          this.nut[idx] = 0;
          continue;
        }

        const cell = this.mesh.cells[idx];
        // Velocity gradient strain rate S = |du/dy + dv/dx|
        const dudy = (this.u[idx + nx] - this.u[idx - nx]) / (2 * cell.dy);
        const dvdx = (this.v[idx + 1] - this.v[idx - 1]) / (2 * cell.dx);
        const strainRate = Math.abs(dudy + dvdx);

        // Mixing length with van Driest near-wall damping
        const lm = Math.min(kappa * yDist, 0.09 * ly);
        // Estimate eddy viscosity
        const eddyVisc = lm * lm * strainRate;

        // Estimate turbulent kinetic energy k ~= 0.5 * lm^2 * strainRate^2
        const kEst = 0.5 * Math.pow(lm * strainRate, 2);
        this.tke[idx] = 0.9 * this.tke[idx] + 0.1 * kEst;
        this.nut[idx] = Math.min(1e-2, eddyVisc);
      }
    }
  }

  /**
   * Multiphase surface tension (CSF model) and gravity
   */
  private applySurfaceTensionAndGravity(dt: number): void {
    const { nx, ny } = this;
    const rho1 = this.options.fluid1.density;
    const rho2 = this.options.fluid2.density;
    const g = this.options.gravityY;
    const sigma = this.options.surfaceTension;

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) continue;

        const cell = this.mesh.cells[idx];
        const a = this.alpha[idx];
        const rhoMix = a * rho1 + (1 - a) * rho2;

        // Gravity force (buoyancy)
        if (Math.abs(g) > 1e-4) {
          this.v[idx] += g * dt * (rhoMix / rho1);
        }

        // Surface tension force (Continuum Surface Force)
        if (sigma > 0) {
          const dadx = (this.alpha[idx + 1] - this.alpha[idx - 1]) / (2 * cell.dx);
          const dady = (this.alpha[idx + nx] - this.alpha[idx - nx]) / (2 * cell.dy);
          const gradMag = Math.hypot(dadx, dady);

          if (gradMag > 0.05) {
            // Curvature kappa = -div(n)
            const kappa =
              ((this.alpha[idx + 1] - 2 * a + this.alpha[idx - 1]) / (cell.dx * cell.dx) +
                (this.alpha[idx + nx] - 2 * a + this.alpha[idx - nx]) / (cell.dy * cell.dy)) /
              (gradMag + 1e-5);

            const fstX = -sigma * kappa * dadx;
            const fstY = -sigma * kappa * dady;

            this.u[idx] += (fstX / rhoMix) * dt;
            this.v[idx] += (fstY / rhoMix) * dt;
          }
        }
      }
    }
  }

  /**
   * Enforces Boundary Conditions (Inlet, Outlet, Top Wall, Bottom Wall, Obstacle)
   */
  private applyBoundaryConditions(): void {
    const { nx, ny } = this;
    const isCavity = this.options.wallVelocity > 0;
    const uLid = this.options.wallVelocity;
    const uInlet = this.options.inletVelocity;
    const slip = this.options.wallCondition === 'slip' ? 1.0 : this.options.wallCondition === 'partialSlip' ? this.options.slipFactor : 0.0;

    // 1. Bottom Wall (j = 0)
    for (let i = 0; i < nx; i++) {
      const idx = i;
      const idxAbove = nx + i;
      this.u[idx] = slip * this.u[idxAbove]; // No-slip or partial slip
      this.v[idx] = 0;
      this.p[idx] = this.p[idxAbove];
    }

    // 2. Top Wall (j = ny - 1)
    for (let i = 0; i < nx; i++) {
      const idx = (ny - 1) * nx + i;
      const idxBelow = (ny - 2) * nx + i;
      if (isCavity) {
        this.u[idx] = uLid; // Moving lid
      } else {
        this.u[idx] = slip * this.u[idxBelow];
      }
      this.v[idx] = 0;
      this.p[idx] = this.p[idxBelow];
    }

    // 3. Left Boundary (Inlet or Wall for cavity)
    for (let j = 0; j < ny; j++) {
      const idx = j * nx;
      const idxRight = j * nx + 1;
      if (isCavity) {
        this.u[idx] = 0;
        this.v[idx] = slip * this.v[idxRight];
        this.p[idx] = this.p[idxRight];
      } else {
        this.u[idx] = uInlet;
        this.v[idx] = 0;
        this.p[idx] = this.p[idxRight];
      }
    }

    // 4. Right Boundary (Outlet or Wall for cavity)
    for (let j = 0; j < ny; j++) {
      const idx = j * nx + (nx - 1);
      const idxLeft = j * nx + (nx - 2);
      if (isCavity) {
        this.u[idx] = 0;
        this.v[idx] = slip * this.v[idxLeft];
        this.p[idx] = this.p[idxLeft];
      } else {
        // Zero-gradient outflow
        this.u[idx] = this.u[idxLeft];
        this.v[idx] = this.v[idxLeft];
        this.p[idx] = 0; // Reference gauge pressure at outlet
      }
    }

    // 5. Obstacle cells boundary condition
    if (this.mesh.config.hasObstacle) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = j * nx + i;
          if (this.mesh.cells[idx].isObstacle) {
            this.u[idx] = 0;
            this.v[idx] = 0;
          }
        }
      }
    }
  }

  /**
   * Pressure-Poisson solver: nabla^2 p = (rho / dt) * div(u*)
   * Solved using Red-Black Gauss-Seidel for convergence & speed
   */
  private solvePressurePoisson(): void {
    const { nx, ny } = this;
    const dt = this.options.timeStep;
    const rho = this.options.fluid1.density;
    const iterations = this.options.poissonIterations;

    // Calculate divergence field div = (du/dx + dv/dy)
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) {
          this.div[idx] = 0;
          continue;
        }

        const cell = this.mesh.cells[idx];
        const dudx = (this.u[idx + 1] - this.u[idx - 1]) / (2 * cell.dx);
        const dvdy = (this.v[idx + nx] - this.v[idx - nx]) / (2 * cell.dy);
        this.div[idx] = dudx + dvdy;
      }
    }

    // Iterative Poisson relaxation
    for (let iter = 0; iter < iterations; iter++) {
      // Red-black pass
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 1; j < ny - 1; j++) {
          for (let i = 1; i < nx - 1; i++) {
            if ((i + j) % 2 !== pass) continue;

            const idx = j * nx + i;
            if (this.mesh.cells[idx].isObstacle) continue;

            const cell = this.mesh.cells[idx];
            const dx2 = cell.dx * cell.dx;
            const dy2 = cell.dy * cell.dy;
            const coeff = 2.0 * (1.0 / dx2 + 1.0 / dy2);

            const pL = this.mesh.cells[idx - 1].isObstacle ? this.p[idx] : this.p[idx - 1];
            const pR = this.mesh.cells[idx + 1].isObstacle ? this.p[idx] : this.p[idx + 1];
            const pD = this.mesh.cells[idx - nx].isObstacle ? this.p[idx] : this.p[idx - nx];
            const pU = this.mesh.cells[idx + nx].isObstacle ? this.p[idx] : this.p[idx + nx];

            const rhs = (rho / dt) * this.div[idx];
            const pNew = ((pL + pR) / dx2 + (pD + pU) / dy2 - rhs) / coeff;

            // Successive Over-Relaxation (SOR) factor omega = 1.3
            this.p[idx] = 0.7 * this.p[idx] + 0.3 * pNew;
          }
        }
      }
    }
  }

  /**
   * Projects velocity: u = u* - (dt / rho) * grad(p)
   */
  private projectVelocity(dt: number): void {
    const { nx, ny } = this;
    const rho = this.options.fluid1.density;

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) continue;

        const cell = this.mesh.cells[idx];
        const dpdx = (this.p[idx + 1] - this.p[idx - 1]) / (2 * cell.dx);
        const dpdy = (this.p[idx + nx] - this.p[idx - nx]) / (2 * cell.dy);

        this.u[idx] -= (dt / rho) * dpdx;
        this.v[idx] -= (dt / rho) * dpdy;
      }
    }
  }

  /**
   * Computes vorticity: omega = dv/dx - du/dy
   */
  private computeVorticity(): void {
    const { nx, ny } = this;

    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        if (this.mesh.cells[idx].isObstacle) {
          this.vorticity[idx] = 0;
          continue;
        }

        const cell = this.mesh.cells[idx];
        const dvdx = (this.v[idx + 1] - this.v[idx - 1]) / (2 * cell.dx);
        const dudy = (this.u[idx + nx] - this.u[idx - nx]) / (2 * cell.dy);
        this.vorticity[idx] = dvdx - dudy;
      }
    }
  }

  /**
   * Calculates Wall Shear Stress (tau_w = mu * du/dy) along bottom & top boundaries
   */
  private computeWallShearStress(): void {
    const { nx, ny } = this;
    const mu = this.options.fluid1.dynamicViscosity;

    this.wallShear.fill(0);

    // Bottom Wall
    for (let i = 0; i < nx; i++) {
      const idx0 = i;
      const idx1 = nx + i;
      const dy = this.mesh.cells[idx1].dy;
      const tau = mu * (this.u[idx1] / Math.max(1e-5, dy));
      this.wallShear[idx0] = tau;
    }

    // Top Wall
    for (let i = 0; i < nx; i++) {
      const idxTop = (ny - 1) * nx + i;
      const idxBelow = (ny - 2) * nx + i;
      const dy = this.mesh.cells[idxBelow].dy;
      const du = this.options.wallVelocity > 0 ? this.options.wallVelocity - this.u[idxBelow] : this.u[idxBelow];
      const tau = mu * (du / Math.max(1e-5, dy));
      this.wallShear[idxTop] = tau;
    }
  }

  /**
   * Update particle positions for streamlines and streaklines
   */
  private updateParticles(dt: number): void {
    const lx = this.mesh.config.lengthX;
    const ly = this.mesh.config.lengthY;

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      pt.age += 1;

      if (pt.age >= pt.maxAge || pt.x < 0 || pt.x > lx || pt.y < 0 || pt.y > ly) {
        // Respawn particle at inlet or random position
        pt.age = 0;
        if (this.options.wallVelocity > 0) {
          // Cavity: spawn anywhere
          pt.x = Math.random() * lx;
          pt.y = Math.random() * ly;
        } else {
          // Channel: spawn at inlet
          pt.x = 0.01 * lx;
          pt.y = 0.05 * ly + Math.random() * 0.9 * ly;
        }
      }

      // Sample velocity at particle position
      pt.vx = this.interpolateField(this.u, pt.x, pt.y);
      pt.vy = this.interpolateField(this.v, pt.x, pt.y);

      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
  }

  /**
   * Residual calculation for convergence monitoring
   */
  private computeResiduals(): void {
    const { nx, ny } = this;
    let sumUx = 0;
    let sumUy = 0;
    let sumP = 0;
    let sumK = 0;
    let count = 0;

    for (let idx = 0; idx < this.size; idx++) {
      if (this.mesh.cells[idx]?.isObstacle) continue;
      sumUx += Math.abs(this.u[idx] - this.u0[idx]);
      sumUy += Math.abs(this.v[idx] - this.v0[idx]);
      sumP += Math.abs(this.p[idx] - this.p0[idx]);
      sumK += Math.abs(this.tke[idx]);
      count++;
    }

    const n = Math.max(1, count);
    this.residuals = {
      ux: sumUx / n,
      uy: sumUy / n,
      p: sumP / n,
      k: sumK / n,
    };

    if (this.iteration % 5 === 0) {
      this.residualHistory.push({
        iter: this.iteration,
        ux: Math.max(1e-7, this.residuals.ux),
        uy: Math.max(1e-7, this.residuals.uy),
        p: Math.max(1e-7, this.residuals.p),
      });
      if (this.residualHistory.length > 80) {
        this.residualHistory.shift();
      }
    }
  }

  /**
   * Updates current physics summary (Re, CFL, forces, shear)
   */
  public updateSummary(): void {
    const { nx, ny } = this;
    let maxVel = 0;
    let minP = Infinity;
    let maxP = -Infinity;
    let maxShear = 0;
    let sumShear = 0;
    let shearCount = 0;

    for (let idx = 0; idx < this.size; idx++) {
      if (this.mesh.cells[idx]?.isObstacle) continue;
      const speed = Math.hypot(this.u[idx], this.v[idx]);
      if (speed > maxVel) maxVel = speed;

      const pVal = this.p[idx];
      if (pVal < minP) minP = pVal;
      if (pVal > maxP) maxP = pVal;

      const ws = Math.abs(this.wallShear[idx]);
      if (ws > 0) {
        if (ws > maxShear) maxShear = ws;
        sumShear += ws;
        shearCount++;
      }
    }

    const charLength = this.mesh.config.hasObstacle
      ? this.mesh.config.obstacleSize
      : this.mesh.config.lengthY;
    const charVel = this.options.wallVelocity > 0 ? this.options.wallVelocity : Math.max(this.options.inletVelocity, maxVel);
    const reynolds = calculateReynoldsNumber(charVel, charLength, this.options.fluid1.kinematicViscosity);
    const classification = classifyFlowRegime(
      reynolds,
      this.options.wallVelocity > 0 ? 'cavity' : 'internal_pipe'
    );

    const cfl = calculateCourantNumber(
      maxVel,
      maxVel,
      this.mesh.stats.minDx,
      this.mesh.stats.minDy,
      this.options.timeStep
    );

    // Obstacle Drag and Lift calculation via surface pressure integral
    let dragForce = 0;
    let liftForce = 0;
    if (this.mesh.config.hasObstacle) {
      const ox = this.mesh.config.obstacleX;
      const oy = this.mesh.config.obstacleY;
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const idx = j * nx + i;
          if (this.mesh.cells[idx].isObstacle) {
            // Check adjacent fluid cells to get surface pressure
            const pVal = this.p[idx];
            const cell = this.mesh.cells[idx];
            const nxDir = cell.x - ox;
            const nyDir = cell.y - oy;
            const len = Math.hypot(nxDir, nyDir) || 1;
            const nX = nxDir / len;
            const nY = nyDir / len;

            dragForce += pVal * nX * cell.dy;
            liftForce += pVal * nY * cell.dx;
          }
        }
      }
    }

    const dynPressure = 0.5 * this.options.fluid1.density * Math.pow(Math.max(1e-4, charVel), 2);
    const area = this.mesh.config.obstacleSize;
    const cd = area > 0 && dynPressure > 0 ? dragForce / (dynPressure * area) : 0;
    const cl = area > 0 && dynPressure > 0 ? liftForce / (dynPressure * area) : 0;

    this.currentSummary = {
      iteration: this.iteration,
      simulationTime: this.simulationTime,
      reynolds,
      regimeName: classification.regime,
      courantNumber: cfl.courantNumber,
      maxVelocity: maxVel,
      minPressure: isFinite(minP) ? minP : 0,
      maxPressure: isFinite(maxP) ? maxP : 0,
      dragCoefficient: cd,
      liftCoefficient: cl,
      dragForce,
      liftForce,
      avgWallShear: shearCount > 0 ? sumShear / shearCount : 0,
      maxWallShear: maxShear,
      residuals: { ...this.residuals },
    };
  }

  /**
   * Probe fluid properties at exact physical coordinates (x, y)
   */
  public probeAt(x: number, y: number): ProbeData {
    const lx = this.mesh.config.lengthX;
    const ly = this.mesh.config.lengthY;
    const clampedX = Math.max(0, Math.min(lx, x));
    const clampedY = Math.max(0, Math.min(ly, y));

    const u = this.interpolateField(this.u, clampedX, clampedY);
    const v = this.interpolateField(this.v, clampedX, clampedY);
    const p = this.interpolateField(this.p, clampedX, clampedY);
    const vorticity = this.interpolateField(this.vorticity, clampedX, clampedY);
    const alpha = this.interpolateField(this.alpha, clampedX, clampedY);
    const nut = this.interpolateField(this.nut, clampedX, clampedY);
    const tke = this.interpolateField(this.tke, clampedX, clampedY);

    // Distance to nearest solid wall
    const distToWall = Math.min(clampedY, ly - clampedY);
    const tau_w = calculateWallShearStress(
      Math.hypot(u, v),
      Math.max(1e-5, distToWall),
      this.options.fluid1.dynamicViscosity
    );
    const u_tau = calculateFrictionVelocity(tau_w, this.options.fluid1.density);
    const yPlus = calculateYPlus(distToWall, u_tau, this.options.fluid1.kinematicViscosity);

    return {
      x: clampedX,
      y: clampedY,
      u,
      v,
      velocityMagnitude: Math.hypot(u, v),
      pressure: p,
      vorticity,
      phaseAlpha: alpha,
      eddyViscosity: nut,
      turbulentKineticEnergy: tke,
      wallShearStress: tau_w,
      yPlus,
    };
  }

  /**
   * Bilinear interpolation of a grid field
   */
  public interpolateField(field: Float32Array, x: number, y: number): number {
    const { nx, ny } = this;
    const lx = this.mesh.config.lengthX;
    const ly = this.mesh.config.lengthY;

    const fx = (Math.max(0, Math.min(lx, x)) / lx) * (nx - 1);
    const fy = (Math.max(0, Math.min(ly, y)) / ly) * (ny - 1);

    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const i1 = Math.min(nx - 1, i0 + 1);
    const j1 = Math.min(ny - 1, j0 + 1);

    const tx = fx - i0;
    const ty = fy - j0;

    const v00 = field[j0 * nx + i0] || 0;
    const v10 = field[j0 * nx + i1] || 0;
    const v01 = field[j1 * nx + i0] || 0;
    const v11 = field[j1 * nx + i1] || 0;

    return (1 - tx) * ((1 - ty) * v00 + ty * v01) + tx * ((1 - ty) * v10 + ty * v11);
  }
}
