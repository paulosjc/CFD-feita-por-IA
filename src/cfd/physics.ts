/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * OpenFOAM Windows Studio - CFD Fluid Dynamics Physics Engine & Estimators
 */

export type FlowRegime = 'laminar' | 'transitional' | 'turbulent';

export interface FluidProperties {
  name: string;
  density: number; // kg/m^3 (rho)
  kinematicViscosity: number; // m^2/s (nu)
  dynamicViscosity: number; // Pa.s (mu = rho * nu)
  surfaceTension?: number; // N/m (sigma) for multiphase
}

export const PRESET_FLUIDS: Record<string, FluidProperties> = {
  water: {
    name: 'Water (20°C)',
    density: 998.2,
    kinematicViscosity: 1.004e-6,
    dynamicViscosity: 1.002e-3,
    surfaceTension: 0.0728,
  },
  air: {
    name: 'Air (20°C)',
    density: 1.204,
    kinematicViscosity: 1.516e-5,
    dynamicViscosity: 1.825e-5,
    surfaceTension: 0.0,
  },
  oil: {
    name: 'Engine Oil (SAE 30)',
    density: 888.0,
    kinematicViscosity: 2.4e-4,
    dynamicViscosity: 0.213,
    surfaceTension: 0.035,
  },
  glycerin: {
    name: 'Glycerin (100%)',
    density: 1261.0,
    kinematicViscosity: 1.18e-3,
    dynamicViscosity: 1.49,
    surfaceTension: 0.0634,
  },
};

/**
 * Calculates Reynolds Number: Re = (rho * U * L) / mu = (U * L) / nu
 */
export function calculateReynoldsNumber(
  velocity: number,
  characteristicLength: number,
  kinematicViscosity: number
): number {
  if (kinematicViscosity <= 0) return 0;
  return (Math.abs(velocity) * characteristicLength) / kinematicViscosity;
}

/**
 * Classifies flow regime based on Reynolds number and geometry
 */
export function classifyFlowRegime(
  reynolds: number,
  type: 'internal_pipe' | 'external_flat_plate' | 'cavity' = 'internal_pipe'
): {
  regime: FlowRegime;
  criticalLower: number;
  criticalUpper: number;
  explanation: string;
} {
  let criticalLower = 2300;
  let criticalUpper = 4000;

  if (type === 'external_flat_plate') {
    criticalLower = 5e5;
    criticalUpper = 1e6;
  } else if (type === 'cavity') {
    criticalLower = 1000;
    criticalUpper = 3500;
  }

  let regime: FlowRegime = 'laminar';
  let explanation = '';

  if (reynolds < criticalLower) {
    regime = 'laminar';
    explanation = `Escoamento Laminar (Re = ${reynolds.toFixed(1)} < ${criticalLower}). Forças viscosas dominam os termos inerciais, amortecendo flutuações e mantendo linhas de corrente paralelas.`;
  } else if (reynolds <= criticalUpper) {
    regime = 'transitional';
    explanation = `Escoamento de Transição (${criticalLower} ≤ Re = ${reynolds.toFixed(1)} ≤ ${criticalUpper}). Instabilidade hidrodinâmica (ondas de Tollmien-Schlichting), formação intermitente de turbilhões.`;
  } else {
    regime = 'turbulent';
    explanation = `Escoamento Turbulento (Re = ${reynolds.toFixed(1)} > ${criticalUpper}). Forças inerciais dominam, gerando cascata de energia de Kolmogorov, vórtices tridimensionais e alta mistura convectiva.`;
  }

  return { regime, criticalLower, criticalUpper, explanation };
}

/**
 * Calculates Courant-Friedrichs-Lewy (CFL) number for numerical stability:
 * C = (|u| * dt) / dx + (|v| * dt) / dy
 */
export function calculateCourantNumber(
  maxVelocityX: number,
  maxVelocityY: number,
  dx: number,
  dy: number,
  dt: number
): {
  courantNumber: number;
  isStable: boolean;
  maxAllowableDt: number;
} {
  const cx = (Math.abs(maxVelocityX) * dt) / Math.max(1e-6, dx);
  const cy = (Math.abs(maxVelocityY) * dt) / Math.max(1e-6, dy);
  const courantNumber = cx + cy;
  const isStable = courantNumber <= 1.0;
  const maxVel = Math.max(1e-5, Math.hypot(maxVelocityX, maxVelocityY));
  const minSpacing = Math.min(dx, dy);
  const maxAllowableDt = minSpacing / maxVel;

  return {
    courantNumber,
    isStable,
    maxAllowableDt,
  };
}

/**
 * Calculates Wall Shear Stress: tau_w = mu * (du/dy)_wall
 */
export function calculateWallShearStress(
  velocityNearWall: number,
  distanceFromWall: number,
  dynamicViscosity: number
): number {
  if (distanceFromWall <= 0) return 0;
  const velocityGradient = velocityNearWall / distanceFromWall;
  return dynamicViscosity * velocityGradient;
}

/**
 * Calculates Friction Velocity: u_tau = sqrt(tau_w / rho)
 */
export function calculateFrictionVelocity(wallShearStress: number, density: number): number {
  if (density <= 0) return 0;
  return Math.sqrt(Math.max(0, Math.abs(wallShearStress)) / density);
}

/**
 * Calculates Dimensionless Wall Distance y+ = (y * u_tau) / nu
 */
export function calculateYPlus(
  distanceFromWall: number,
  frictionVelocity: number,
  kinematicViscosity: number
): number {
  if (kinematicViscosity <= 0) return 0;
  return (distanceFromWall * frictionVelocity) / kinematicViscosity;
}

/**
 * Calculates Skin Friction Coefficient Cf = (2 * tau_w) / (rho * U_inf^2)
 */
export function calculateSkinFrictionCoefficient(
  wallShearStress: number,
  density: number,
  freestreamVelocity: number
): number {
  const dynamicPressure = 0.5 * density * Math.pow(Math.max(1e-5, Math.abs(freestreamVelocity)), 2);
  return wallShearStress / dynamicPressure;
}

/**
 * Calculates Boundary Layer Thickness delta(x)
 * Laminar (Blasius): delta = 5.0 * x / sqrt(Re_x)
 * Turbulent (Prandtl 1/7): delta = 0.37 * x / (Re_x)^0.2
 */
export function calculateBoundaryLayerThickness(
  x: number,
  reynoldsX: number,
  regime: FlowRegime
): {
  delta: number; // 99% velocity boundary layer thickness
  displacementThickness: number; // delta*
  momentumThickness: number; // theta
  shapeFactor: number; // H = delta* / theta
} {
  if (x <= 0 || reynoldsX <= 0) {
    return { delta: 0, displacementThickness: 0, momentumThickness: 0, shapeFactor: 0 };
  }

  if (regime === 'laminar') {
    const delta = (5.0 * x) / Math.sqrt(reynoldsX);
    const displacementThickness = (1.72 * x) / Math.sqrt(reynoldsX);
    const momentumThickness = (0.664 * x) / Math.sqrt(reynoldsX);
    const shapeFactor = displacementThickness / momentumThickness; // ~ 2.59 for Blasius
    return { delta, displacementThickness, momentumThickness, shapeFactor };
  } else {
    // Turbulent 1/7th power law
    const reFactor = Math.pow(reynoldsX, 0.2);
    const delta = (0.37 * x) / reFactor;
    const displacementThickness = delta / 8.0; // delta/8
    const momentumThickness = (7 * delta) / 72.0; // 7*delta/72
    const shapeFactor = displacementThickness / momentumThickness; // ~ 1.286
    return { delta, displacementThickness, momentumThickness, shapeFactor };
  }
}

/**
 * Calculates Drag and Lift coefficients:
 * Cd = (2 * Fd) / (rho * U^2 * A)
 * Cl = (2 * Fl) / (rho * U^2 * A)
 */
export function calculateAerodynamicCoefficients(
  dragForce: number,
  liftForce: number,
  density: number,
  velocity: number,
  referenceArea: number
): {
  dragCoefficient: number;
  liftCoefficient: number;
  dynamicPressure: number;
} {
  const dynamicPressure = 0.5 * density * Math.pow(Math.max(1e-5, Math.abs(velocity)), 2);
  const denom = dynamicPressure * Math.max(1e-6, referenceArea);
  return {
    dragCoefficient: dragForce / denom,
    liftCoefficient: liftForce / denom,
    dynamicPressure,
  };
}

/**
 * Calculates Total Pressure (Bernoulli):
 * p0 = p_static + 0.5 * rho * (u^2 + v^2)
 */
export function calculateTotalPressure(
  staticPressure: number,
  density: number,
  velocityX: number,
  velocityY: number
): {
  staticPressure: number;
  dynamicPressure: number;
  totalPressure: number;
} {
  const dynamicPressure = 0.5 * density * (velocityX * velocityX + velocityY * velocityY);
  return {
    staticPressure,
    dynamicPressure,
    totalPressure: staticPressure + dynamicPressure,
  };
}

/**
 * Multiphase Mixture Properties (Volume of Fluid - VOF)
 * rho = alpha * rho1 + (1 - alpha) * rho2
 * mu = alpha * mu1 + (1 - alpha) * mu2
 */
export function calculateMixtureProperties(
  alpha: number,
  fluid1: FluidProperties,
  fluid2: FluidProperties
): {
  density: number;
  dynamicViscosity: number;
  kinematicViscosity: number;
} {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const density = clampedAlpha * fluid1.density + (1 - clampedAlpha) * fluid2.density;
  const dynamicViscosity =
    clampedAlpha * fluid1.dynamicViscosity + (1 - clampedAlpha) * fluid2.dynamicViscosity;
  const kinematicViscosity = dynamicViscosity / density;

  return {
    density,
    dynamicViscosity,
    kinematicViscosity,
  };
}

/**
 * Theoretical Poiseuille Parabolic velocity profile for 2D channel:
 * u(y) = 4 * U_max * (y/H) * (1 - y/H)
 */
export function theoreticalPoiseuilleVelocity(y: number, channelHeight: number, uMax: number): number {
  if (channelHeight <= 0) return 0;
  const normalizedY = y / channelHeight;
  if (normalizedY < 0 || normalizedY > 1) return 0;
  return 4.0 * uMax * normalizedY * (1.0 - normalizedY);
}

/**
 * Theoretical Turbulent 1/7th Power Law velocity profile:
 * u(y) = U_max * (y / delta)^(1/7)
 */
export function theoreticalTurbulentVelocity(y: number, boundaryLayerThickness: number, uMax: number): number {
  if (boundaryLayerThickness <= 0 || y <= 0) return 0;
  if (y >= boundaryLayerThickness) return uMax;
  return uMax * Math.pow(y / boundaryLayerThickness, 1 / 7);
}

/**
 * Pressure drop in pipe/channel Darcy-Weisbach:
 * Delta P = f * (L/D) * (rho * U^2 / 2)
 * For laminar: f = 64 / Re (pipe) or f = 96 / Re (parallel plates)
 */
export function calculateDarcyFrictionFactor(reynolds: number, roughnessRatio = 0): number {
  if (reynolds <= 0) return 0;
  if (reynolds < 2300) {
    return 64.0 / reynolds;
  }
  // Swamee-Jain formula for turbulent friction factor
  const term1 = roughnessRatio / 3.7;
  const term2 = 5.74 / Math.pow(reynolds, 0.9);
  const logTerm = Math.log10(term1 + term2);
  return 0.25 / (logTerm * logTerm);
}
