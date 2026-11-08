/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Mesh Generator (blockMesh / snappyHexMesh 2D)
 */

export interface MeshConfig {
  nx: number; // Cells along X
  ny: number; // Cells along Y
  lengthX: number; // Domain length in meters (default 2.0m)
  lengthY: number; // Domain height in meters (default 1.0m)
  gradingX: number; // Geometric expansion ratio along X (1.0 = uniform)
  gradingY: number; // Expansion ratio towards walls (boundary layer inflation)
  hasObstacle: boolean;
  obstacleType: 'cylinder' | 'square' | 'step' | 'airfoil' | 'none';
  obstacleX: number;
  obstacleY: number;
  obstacleSize: number;
}

export interface MeshCell {
  i: number;
  j: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  isObstacle: boolean;
  isWall: boolean;
  patch: 'internal' | 'inlet' | 'outlet' | 'topWall' | 'bottomWall' | 'obstacle';
}

export interface MeshStats {
  totalCells: number;
  activeFluidCells: number;
  obstacleCells: number;
  minDx: number;
  maxDx: number;
  minDy: number;
  maxDy: number;
  minAspectRatio: number;
  maxAspectRatio: number;
  nonOrthogonality: number; // degrees, 0 for Cartesian
  meshQualityScore: number; // 0 to 100%
  blockMeshDictPreview: string;
}

export class MeshGenerator {
  public config: MeshConfig;
  public cells: MeshCell[] = [];
  public gridX: number[] = []; // Cell centers
  public gridY: number[] = [];
  public nodeX: number[] = []; // Node boundaries (length nx + 1)
  public nodeY: number[] = []; // Node boundaries (length ny + 1)
  public stats!: MeshStats;

  constructor(config: Partial<MeshConfig> = {}) {
    this.config = {
      nx: config.nx ?? 120,
      ny: config.ny ?? 60,
      lengthX: config.lengthX ?? 2.0,
      lengthY: config.lengthY ?? 1.0,
      gradingX: config.gradingX ?? 1.0,
      gradingY: config.gradingY ?? 1.2, // graded near top and bottom walls
      hasObstacle: config.hasObstacle ?? false,
      obstacleType: config.obstacleType ?? 'cylinder',
      obstacleX: config.obstacleX ?? 0.5,
      obstacleY: config.obstacleY ?? 0.5,
      obstacleSize: config.obstacleSize ?? 0.15,
    };

    this.generate();
  }

  public updateConfig(newConfig: Partial<MeshConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.generate();
  }

  public generate(): void {
    const { nx, ny, lengthX, lengthY, gradingX, gradingY } = this.config;

    // 1. Generate node coordinates with optional wall grading
    this.nodeX = this.computeGradedNodes(nx, lengthX, gradingX, false);
    // Grade towards top and bottom boundaries for boundary layer resolution
    this.nodeY = this.computeWallGradedNodes(ny, lengthY, gradingY);

    this.gridX = new Array(nx);
    for (let i = 0; i < nx; i++) {
      this.gridX[i] = (this.nodeX[i] + this.nodeX[i + 1]) * 0.5;
    }

    this.gridY = new Array(ny);
    for (let j = 0; j < ny; j++) {
      this.gridY[j] = (this.nodeY[j] + this.nodeY[j + 1]) * 0.5;
    }

    // 2. Generate cell elements and apply boundary patches
    this.cells = new Array(nx * ny);
    let obstacleCount = 0;
    let minAsp = Infinity;
    let maxAsp = -Infinity;
    let minDx = Infinity;
    let maxDx = -Infinity;
    let minDy = Infinity;
    let maxDy = -Infinity;

    for (let j = 0; j < ny; j++) {
      const dy = this.nodeY[j + 1] - this.nodeY[j];
      minDy = Math.min(minDy, dy);
      maxDy = Math.max(maxDy, dy);

      for (let i = 0; i < nx; i++) {
        const dx = this.nodeX[i + 1] - this.nodeX[i];
        minDx = Math.min(minDx, dx);
        maxDx = Math.max(maxDx, dx);

        const x = this.gridX[i];
        const y = this.gridY[j];
        const asp = Math.max(dx / dy, dy / dx);
        minAsp = Math.min(minAsp, asp);
        maxAsp = Math.max(maxAsp, asp);

        const isObstacle = this.checkIfObstacle(x, y);
        if (isObstacle) obstacleCount++;

        let patch: MeshCell['patch'] = 'internal';
        let isWall = false;

        if (isObstacle) {
          patch = 'obstacle';
          isWall = true;
        } else if (i === 0) {
          patch = 'inlet';
        } else if (i === nx - 1) {
          patch = 'outlet';
        } else if (j === 0) {
          patch = 'bottomWall';
          isWall = true;
        } else if (j === ny - 1) {
          patch = 'topWall';
          isWall = true;
        }

        const idx = j * nx + i;
        this.cells[idx] = {
          i,
          j,
          x,
          y,
          dx,
          dy,
          isObstacle,
          isWall,
          patch,
        };
      }
    }

    const totalCells = nx * ny;
    const activeFluidCells = totalCells - obstacleCount;

    // Quality Score calculation based on aspect ratio
    // Ideal aspect ratio = 1.0 (100% score). Aspect ratio > 10 lowers score.
    const qualityPenalty = Math.min(60, (maxAsp - 1.0) * 4.0);
    const meshQualityScore = Math.max(40, Math.round(100 - qualityPenalty));

    const blockMeshDictPreview = this.generateBlockMeshDict();

    this.stats = {
      totalCells,
      activeFluidCells,
      obstacleCells: obstacleCount,
      minDx,
      maxDx,
      minDy,
      maxDy,
      minAspectRatio: Number(minAsp.toFixed(2)),
      maxAspectRatio: Number(maxAsp.toFixed(2)),
      nonOrthogonality: 0.0, // Perfectly orthogonal Cartesian
      meshQualityScore,
      blockMeshDictPreview,
    };
  }

  private checkIfObstacle(x: number, y: number): boolean {
    if (!this.config.hasObstacle || this.config.obstacleType === 'none') {
      return false;
    }

    const ox = this.config.obstacleX;
    const oy = this.config.obstacleY;
    const size = this.config.obstacleSize;

    switch (this.config.obstacleType) {
      case 'cylinder': {
        const radius = size * 0.5;
        const distSq = (x - ox) * (x - ox) + (y - oy) * (y - oy);
        return distSq <= radius * radius;
      }
      case 'square': {
        const half = size * 0.5;
        return x >= ox - half && x <= ox + half && y >= oy - half && y <= oy + half;
      }
      case 'step': {
        // Backward-facing step: step occupies lower-left corner
        return x <= ox && y <= size;
      }
      case 'airfoil': {
        // NACA-like symmetric streamline obstacle
        const chord = size * 2.0;
        const thickness = size * 0.35;
        if (x < ox || x > ox + chord) return false;
        const xc = (x - ox) / chord;
        // Symmetric thickness envelope
        const yt =
          5 *
          thickness *
          (0.2969 * Math.sqrt(xc) -
            0.126 * xc -
            0.3516 * xc * xc +
            0.2843 * Math.pow(xc, 3) -
            0.1015 * Math.pow(xc, 4));
        return Math.abs(y - oy) <= yt * 0.5;
      }
      default:
        return false;
    }
  }

  /**
   * Generates node distributions with expansion ratio
   */
  private computeGradedNodes(n: number, length: number, r: number, doubleSided = false): number[] {
    const nodes = new Array(n + 1);
    nodes[0] = 0;

    if (Math.abs(r - 1.0) < 1e-4) {
      // Uniform distribution
      const step = length / n;
      for (let i = 1; i <= n; i++) {
        nodes[i] = i * step;
      }
      return nodes;
    }

    // Geometric grading
    let sum = 0;
    const weights = new Array(n);
    for (let i = 0; i < n; i++) {
      const frac = i / (n - 1);
      weights[i] = Math.pow(r, frac);
      sum += weights[i];
    }

    let acc = 0;
    for (let i = 0; i < n; i++) {
      acc += (weights[i] / sum) * length;
      nodes[i + 1] = acc;
    }
    nodes[n] = length;
    return nodes;
  }

  /**
   * Generates nodes graded near top and bottom walls (boundary layer refinement)
   */
  private computeWallGradedNodes(n: number, length: number, wallGrading: number): number[] {
    const nodes = new Array(n + 1);
    nodes[0] = 0;

    if (Math.abs(wallGrading - 1.0) < 1e-4) {
      const step = length / n;
      for (let i = 1; i <= n; i++) {
        nodes[i] = i * step;
      }
      return nodes;
    }

    // S-curve hyperbolic tangent / cosine distribution for boundary inflation
    for (let i = 1; i <= n; i++) {
      const xi = i / n;
      // Stretched coordinate: xi in [0, 1]
      // Blends linear with sine-smoothed near edges
      const s = 0.5 * (1.0 - Math.cos(Math.PI * xi));
      const blend = (1.0 - 1.0 / wallGrading) * s + (1.0 / wallGrading) * xi;
      nodes[i] = blend * length;
    }
    nodes[n] = length;
    return nodes;
  }

  /**
   * Generates real OpenFOAM blockMeshDict syntax
   */
  public generateBlockMeshDict(): string {
    const { nx, ny, lengthX, lengthY, gradingX, gradingY } = this.config;
    return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  v2406 (Windows Studio Edition)        |
|   \\\\  /    A nd           | Web:      www.openfoam.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

scale   1;

vertices
(
    (0 0 0)
    (${lengthX} 0 0)
    (${lengthX} ${lengthY} 0)
    (0 ${lengthY} 0)
    (0 0 0.1)
    (${lengthX} 0 0.1)
    (${lengthX} ${lengthY} 0.1)
    (0 ${lengthY} 0.1)
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (${nx} ${ny} 1) simpleGrading (${gradingX} ${gradingY} 1)
);

edges
(
);

boundary
(
    inlet
    {
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }
    outlet
    {
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }
    bottomWall
    {
        type wall;
        faces
        (
            (0 1 5 4)
        );
    }
    topWall
    {
        type wall;
        faces
        (
            (3 7 6 2)
        );
    }
    frontAndBack
    {
        type empty;
        faces
        (
            (0 3 2 1)
            (4 5 6 7)
        );
    }
);

// ************************************************************************* //
`;
  }
}
