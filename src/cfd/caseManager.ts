/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - Case Manager & Presets
 */

import { SolverOptions } from './solver';
import { MeshConfig } from './mesher';
import { PRESET_FLUIDS } from './physics';

export interface CasePreset {
  id: string;
  name: string;
  description: string;
  solverType: 'simpleFoam' | 'icoFoam' | 'pimpleFoam' | 'interFoam';
  regime: 'laminar' | 'transitional' | 'turbulent';
  mesh: Partial<MeshConfig>;
  solver: Partial<SolverOptions>;
  initialFieldPattern?: 'damBreak' | 'bubble' | 'stratified' | 'uniform';
  foamFiles: Record<string, string>;
}

export const CASE_PRESETS: CasePreset[] = [
  {
    id: 'cavity',
    name: '1. Lid-Driven Cavity (Tutorial Clássico)',
    description: 'Vórtice primário e vórtices secundários de canto acionados pela parede superior em movimento (U = 1.0 m/s). Benchmark padrão do OpenFOAM icoFoam.',
    solverType: 'icoFoam',
    regime: 'laminar',
    mesh: {
      nx: 70,
      ny: 70,
      lengthX: 1.0,
      lengthY: 1.0,
      gradingX: 1.0,
      gradingY: 1.2,
      hasObstacle: false,
    },
    solver: {
      solverType: 'icoFoam',
      regime: 'laminar',
      inletVelocity: 0.0,
      wallVelocity: 1.0,
      wallCondition: 'noSlip',
      timeStep: 0.005,
      poissonIterations: 25,
      fluid1: {
        name: 'Óleo Mineral Leve (Benchmark)',
        density: 1000,
        kinematicViscosity: 0.001, // Re = 1000 (OpenFOAM cavity benchmark)
        dynamicViscosity: 1.0,
      },
      isMultiphase: false,
      gravityY: 0,
    },
    initialFieldPattern: 'uniform',
    foamFiles: {
      'system/controlDict': `/*--------------------------------*- C++ -*----------------------------------*\\
| OpenFOAM: The Open Source CFD Toolbox - Windows Studio                      |
\\*---------------------------------------------------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object controlDict; }
application     icoFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         10;
deltaT          0.005;
writeControl    timeStep;
writeInterval   20;
purgeWrite      0;
writeFormat     ascii;
runTimeModifiable true;`,
      '0/U': `FoamFile { version 2.0; format ascii; class volVectorField; object U; }
dimensions      [0 1 -1 0 0 0 0];
internalField   uniform (0 0 0);
boundaryField
{
    movingWall { type fixedValue; value uniform (1 0 0); }
    fixedWalls { type noSlip; }
    frontAndBack { type empty; }
}`,
      '0/p': `FoamFile { version 2.0; format ascii; class volScalarField; object p; }
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;
boundaryField
{
    movingWall { type zeroGradient; }
    fixedWalls { type zeroGradient; }
    frontAndBack { type empty; }
}`,
      'constant/transportProperties': `FoamFile { version 2.0; format ascii; class dictionary; object transportProperties; }
transportModel  Newtonian;
nu              [0 2 -1 0 0 0 0] 1.004e-06;
rho             [1 -3 0 0 0 0 0] 998.2;`,
    },
  },
  {
    id: 'cylinderFlow',
    name: '2. Escoamento sobre Cilindro (Vórtices de von Kármán)',
    description: 'Esteira de vórtices periódicos alternados (vortex shedding), cálculo de frequência Strouhal, arrasto (Cd) e sustentação (Cl) oscilatória.',
    solverType: 'pimpleFoam',
    regime: 'transitional',
    mesh: {
      nx: 110,
      ny: 55,
      lengthX: 2.2,
      lengthY: 1.1,
      gradingX: 1.0,
      gradingY: 1.0,
      hasObstacle: true,
      obstacleType: 'cylinder',
      obstacleX: 0.55,
      obstacleY: 0.55,
      obstacleSize: 0.22,
    },
    solver: {
      solverType: 'pimpleFoam',
      regime: 'transitional',
      inletVelocity: 1.5,
      wallVelocity: 0.0,
      wallCondition: 'slip', // Slip for outer wind tunnel walls
      timeStep: 0.004,
      poissonIterations: 30,
      fluid1: {
        name: 'Ar Atmosférico / Túnel de Vento',
        density: 1.2,
        kinematicViscosity: 0.00165, // Re = 1.5 * 0.22 / 0.00165 = 200 (Karman vortex shedding)
        dynamicViscosity: 1.98e-3,
      },
      isMultiphase: false,
      gravityY: 0,
    },
    initialFieldPattern: 'uniform',
    foamFiles: {
      'system/controlDict': `application     pimpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         20;
deltaT          0.004;
writeControl    adjustableRunTime;
maxCo           0.8;`,
      'constant/turbulenceProperties': `simulationType  RAS;
RAS
{
    RASModel        kOmegaSST;
    turbulence      on;
    printCoeffs     on;
}`,
      '0/U': `internalField   uniform (1.5 0 0);
boundaryField
{
    inlet { type fixedValue; value uniform (1.5 0 0); }
    outlet { type inletOutlet; inletValue uniform (0 0 0); value uniform (1.5 0 0); }
    cylinder { type noSlip; }
    topWall { type slip; }
    bottomWall { type slip; }
}`,
    },
  },
  {
    id: 'damBreak',
    name: '3. Dam Break (Multifásico VOF - Água & Ar)',
    description: 'Colapso de coluna de água sobre ar atmosférico, rastreamento de interface livre (VOF alpha.water), gravidade g = -9.81 m/s² e impacto na parede.',
    solverType: 'interFoam',
    regime: 'turbulent',
    mesh: {
      nx: 80,
      ny: 60,
      lengthX: 1.6,
      lengthY: 1.2,
      gradingX: 1.0,
      gradingY: 1.1,
      hasObstacle: false,
    },
    solver: {
      solverType: 'interFoam',
      regime: 'turbulent',
      inletVelocity: 0.0,
      wallVelocity: 0.0,
      wallCondition: 'noSlip',
      timeStep: 0.003,
      poissonIterations: 35,
      fluid1: PRESET_FLUIDS.water,
      fluid2: PRESET_FLUIDS.air,
      isMultiphase: true,
      gravityY: -9.81,
      surfaceTension: 0.0728,
    },
    initialFieldPattern: 'damBreak',
    foamFiles: {
      'system/controlDict': `application     interFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         5.0;
deltaT          0.003;
writeControl    timeStep;
writeInterval   10;`,
      '0/alpha.water': `dimensions      [0 0 0 0 0 0 0];
internalField   nonuniform; // Set by setFields
boundaryField
{
    atmosphere { type inletOutlet; inletValue uniform 0; value uniform 0; }
    walls { type zeroGradient; }
}`,
      'constant/transportProperties': `phases (water air);
water
{
    transportModel  Newtonian;
    nu              1.004e-06;
    rho             998.2;
}
air
{
    transportModel  Newtonian;
    nu              1.516e-05;
    rho             1.204;
}
sigma           0.0728;`,
      'system/setFieldsDict': `defaultFieldValues
(
    volScalarFieldValue alpha.water 0
);
regions
(
    boxToCell
    {
        box (0 0 -1) (0.45 0.7 1);
        fieldValues
        (
            volScalarFieldValue alpha.water 1
        );
    }
);`,
    },
  },
  {
    id: 'poiseuille',
    name: '4. Escoamento em Canal (Poiseuille & Couette)',
    description: 'Canal com perfil parabólico exato, desenvolvimento da camada limite, tensão de cisalhamento na parede (tau_w) e fator de atrito Darcy-Weisbach.',
    solverType: 'simpleFoam',
    regime: 'laminar',
    mesh: {
      nx: 100,
      ny: 45,
      lengthX: 2.0,
      lengthY: 0.6,
      gradingX: 1.0,
      gradingY: 1.4, // Wall refinement
      hasObstacle: false,
    },
    solver: {
      solverType: 'simpleFoam',
      regime: 'laminar',
      inletVelocity: 1.2,
      wallVelocity: 0.0,
      wallCondition: 'noSlip',
      timeStep: 0.005,
      poissonIterations: 20,
      fluid1: PRESET_FLUIDS.oil,
      isMultiphase: false,
      gravityY: 0,
    },
    initialFieldPattern: 'uniform',
    foamFiles: {
      'system/controlDict': `application     simpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         1000;
deltaT          1; // SIMPLE steady-state pseudo-transient`,
      'system/fvSolution': `solvers
{
    p { solver GAMG; tolerance 1e-06; relTol 0.01; }
    U { solver smoothSolver; tolerance 1e-05; relTol 0.1; }
}
SIMPLE
{
    nNonOrthogonalCorrectors 0;
    consistent yes;
    residualControl
    {
        p 1e-4;
        U 1e-4;
    }
}
relaxationFactors
{
    fields { p 0.3; }
    equations { U 0.7; }
}`,
    },
  },
  {
    id: 'backwardFacingStep',
    name: '5. Degrau com Separação (Backward-Facing Step)',
    description: 'Separação induzida por descontinuidade geométrica, bolha de recirculação, ponto de recolamento e perturbação da camada cisalhante.',
    solverType: 'pimpleFoam',
    regime: 'turbulent',
    mesh: {
      nx: 100,
      ny: 50,
      lengthX: 2.5,
      lengthY: 1.0,
      gradingX: 1.0,
      gradingY: 1.2,
      hasObstacle: true,
      obstacleType: 'step',
      obstacleX: 0.6,
      obstacleY: 0.0,
      obstacleSize: 0.45,
    },
    solver: {
      solverType: 'pimpleFoam',
      regime: 'turbulent',
      inletVelocity: 1.8,
      wallVelocity: 0.0,
      wallCondition: 'noSlip',
      timeStep: 0.004,
      poissonIterations: 25,
      fluid1: PRESET_FLUIDS.air,
      isMultiphase: false,
      gravityY: 0,
    },
    initialFieldPattern: 'uniform',
    foamFiles: {
      'system/controlDict': `application     pimpleFoam;
startTime       0;
endTime         15;
deltaT          0.004;`,
      'constant/turbulenceProperties': `simulationType  RAS;
RAS
{
    RASModel        kEpsilon;
    turbulence      on;
}`,
    },
  },
  {
    id: 'nacaAirfoil',
    name: '6. Perfil Aerodinâmico / Aerofólio (Sustentação & Arrasto)',
    description: 'Escoamento externo sobre corpo aerodinâmico, camada limite aderente, ponto de estagnação frontal e vórtices de bordo de fuga.',
    solverType: 'simpleFoam',
    regime: 'transitional',
    mesh: {
      nx: 110,
      ny: 50,
      lengthX: 2.2,
      lengthY: 1.0,
      gradingX: 1.0,
      gradingY: 1.1,
      hasObstacle: true,
      obstacleType: 'airfoil',
      obstacleX: 0.5,
      obstacleY: 0.5,
      obstacleSize: 0.35,
    },
    solver: {
      solverType: 'simpleFoam',
      regime: 'transitional',
      inletVelocity: 2.0,
      wallVelocity: 0.0,
      wallCondition: 'slip',
      timeStep: 0.004,
      poissonIterations: 30,
      fluid1: PRESET_FLUIDS.air,
      isMultiphase: false,
      gravityY: 0,
    },
    initialFieldPattern: 'uniform',
    foamFiles: {
      'system/controlDict': `application     simpleFoam;
startTime       0;
endTime         500;`,
      'system/forceCoeffs': `type            forceCoeffs;
libs            ("libforces.so");
patches         (airfoil);
rho             rhoInf;
log             true;
rhoInf          1.204;
liftDir         (0 1 0);
dragDir         (1 0 0);
pitchAxis       (0 0 1);
magUInf         2.0;
lRef            0.7;
Aref            0.7;`,
    },
  },
];
