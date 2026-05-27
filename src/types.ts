export interface PhysicsConfig {
  stiffness: number
  damping: number
  mass: number
}

export interface Config extends PhysicsConfig {
  leaderTrail: number
  followerTrail: number
  showLeader: boolean
  showFollower: boolean
  trailType: 'outline' | 'path'
  trailFade: boolean
}

export type MetricSample = { dist: number; vDiff: number }
export type MetricIndex = 0 | 1 | 2

export type TrailPoint = { x: number; y: number; t: number }
export type RecordedPoint = { x: number; y: number; t: number }
export type Recording = { points: RecordedPoint[]; duration: number; returnDuration: number; config: Config }
