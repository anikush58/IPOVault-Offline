import { RadarCategory, CATEGORY_RANK } from './radarScoringEngine';
import { RadarSnapshotRecord } from './radarSnapshotService';

export type RadarTrajectoryState =
  | 'ACCELERATING'
  | 'IMPROVING'
  | 'STABLE'
  | 'WEAKENING'
  | 'DETERIORATING'
  | 'INSUFFICIENT_HISTORY';

export interface ConvictionMomentumBreakdown {
  score: number; // -100 to +100
  label: string; // e.g. "Strongly Improving", "Improving", "Stable", "Weakening", "Rapid Deterioration"
  drivers: string[];
  risks: string[];
}

export interface TrajectoryAnalysisResult {
  trajectory: RadarTrajectoryState;
  trajectoryLabel: string;
  trajectoryIcon: string;
  momentum: ConvictionMomentumBreakdown;
  scoreVelocity: number;
  categoryProgression: string;
}

/**
 * Calculates Trajectory & Conviction Momentum from historical snapshots.
 * If no snapshots exist, returns INSUFFICIENT_HISTORY with no fake history!
 */
export function analyzeRadarTrajectory(
  snapshots: RadarSnapshotRecord[],
  currentScore: number,
  currentCategory: RadarCategory
): TrajectoryAnalysisResult {
  const drivers: string[] = [];
  const risks: string[] = [];

  if (!snapshots || snapshots.length < 1) {
    return {
      trajectory: 'INSUFFICIENT_HISTORY',
      trajectoryLabel: 'Insufficient History',
      trajectoryIcon: '❓',
      momentum: {
        score: 0,
        label: 'Stable (No History)',
        drivers: ['First-time evaluation; awaiting historical snapshot updates'],
        risks: [],
      },
      scoreVelocity: 0,
      categoryProgression: currentCategory.replace('_', ' '),
    };
  }

  // Use latest historical snapshot
  const prev = snapshots[0];
  const prevCategory = prev.category;
  const prevScore = prev.score;

  const prevRank = CATEGORY_RANK[prevCategory] ?? 1;
  const currRank = CATEGORY_RANK[currentCategory] ?? 1;

  const categoryDiff = currRank - prevRank;
  const scoreVelocity = currentScore - prevScore;

  // 1. Calculate Conviction Momentum Score (-100 to +100)
  let momentumScore = 0;

  // Category movement contribution
  if (categoryDiff > 0) {
    momentumScore += categoryDiff * 25;
    drivers.push(`Category upgraded from ${prevCategory.replace('_', ' ')} to ${currentCategory.replace('_', ' ')}`);
  } else if (categoryDiff < 0) {
    momentumScore += categoryDiff * 30;
    risks.push(`Category downgraded from ${prevCategory.replace('_', ' ')} to ${currentCategory.replace('_', ' ')}`);
  }

  // Score velocity contribution
  const velContribution = Math.min(30, Math.max(-30, scoreVelocity * 2));
  momentumScore += velContribution;
  if (scoreVelocity >= 10) {
    drivers.push(`Strong score velocity (+${scoreVelocity} points)`);
  } else if (scoreVelocity >= 5) {
    drivers.push(`Positive score velocity (+${scoreVelocity} points)`);
  } else if (scoreVelocity <= -10) {
    risks.push(`Sharp score drop (${scoreVelocity} points)`);
  } else if (scoreVelocity <= -5) {
    risks.push(`Score decline (${scoreVelocity} points)`);
  }

  // GMP direction contribution
  const prevGmp = prev.gmp_percent ?? 0;
  const currGmp = prev.gmp_percent ?? 0;
  if (currGmp - prevGmp >= 10) {
    momentumScore += 15;
    drivers.push(`GMP premium expanded significantly (+${(currGmp - prevGmp).toFixed(1)}%)`);
  } else if (currGmp - prevGmp <= -10) {
    momentumScore -= 20;
    risks.push(`GMP premium contracted significantly (${(currGmp - prevGmp).toFixed(1)}%)`);
  }

  // Subscription acceleration contribution
  const prevSub = prev.total_subscription ?? 0;
  const currSub = prev.total_subscription ?? 0;
  if (currSub - prevSub >= 5) {
    momentumScore += 15;
    drivers.push(`Subscription demand accelerated (+${(currSub - prevSub).toFixed(1)}x)`);
  } else if (currSub < 1.0 && prevSub >= 1.0) {
    momentumScore -= 25;
    risks.push(`Subscription demand dropped into undersubscribed territory (${currSub.toFixed(2)}x)`);
  }

  // Bound momentum score between -100 and +100
  momentumScore = Math.min(100, Math.max(-100, momentumScore));

  let momentumLabel = 'Stable';
  if (momentumScore >= 60) momentumLabel = 'Strongly Improving';
  else if (momentumScore >= 20) momentumLabel = 'Improving';
  else if (momentumScore >= -19) momentumLabel = 'Stable';
  else if (momentumScore >= -59) momentumLabel = 'Weakening';
  else momentumLabel = 'Rapid Deterioration';

  // 2. Trajectory State Determination
  let trajectory: RadarTrajectoryState = 'STABLE';
  let trajectoryLabel = 'Stable';
  let trajectoryIcon = '➡️';

  if (categoryDiff >= 2 || (categoryDiff >= 1 && scoreVelocity >= 10) || momentumScore >= 60) {
    trajectory = 'ACCELERATING';
    trajectoryLabel = 'Accelerating';
    trajectoryIcon = '🚀';
  } else if (categoryDiff >= 1 || scoreVelocity >= 5 || momentumScore >= 20) {
    trajectory = 'IMPROVING';
    trajectoryLabel = 'Improving';
    trajectoryIcon = '📈';
  } else if (currentCategory === 'AVOID' || categoryDiff <= -2 || scoreVelocity <= -15 || momentumScore <= -60) {
    trajectory = 'DETERIORATING';
    trajectoryLabel = 'Deteriorating';
    trajectoryIcon = '⚠️';
  } else if (categoryDiff <= -1 || scoreVelocity <= -5 || momentumScore <= -20) {
    trajectory = 'WEAKENING';
    trajectoryLabel = 'Weakening';
    trajectoryIcon = '📉';
  } else {
    trajectory = 'STABLE';
    trajectoryLabel = 'Stable';
    trajectoryIcon = '➡️';
  }

  const categoryProgression = `${prevCategory.replace('_', ' ')} → ${currentCategory.replace('_', ' ')}`;

  return {
    trajectory,
    trajectoryLabel,
    trajectoryIcon,
    momentum: {
      score: momentumScore,
      label: momentumLabel,
      drivers: drivers.length > 0 ? drivers : ['Consistent metric stability'],
      risks,
    },
    scoreVelocity,
    categoryProgression,
  };
}
