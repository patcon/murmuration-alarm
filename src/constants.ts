import type { Config } from './types'

export const LEADER_RADIUS = 44
export const FOLLOWER_RADIUS = 30
export const PANEL_HEIGHT = 270
export const DOUBLE_TAP_MS = 300

export const DEFAULT_CONFIG: Config = {
  stiffness: 0.12,
  damping: 0.75,
  mass: 1,
  leaderTrail: 0,
  followerTrail: 0,
  showLeader: true,
  showFollower: true,
  trailType: 'outline',
  trailFade: true,
}
