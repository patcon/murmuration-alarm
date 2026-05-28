# Game Metrics & Dynamics Exploration

**Date:** 2026-05-27

The core premise: the recorded path (ghost) stands in for User 1, and a live player (User 2) tries to stay in sync with it. The game is about synchrony — cooperative or competitive.

## What the system gives us

- **Ghost leader** — the recorded User 1 path, replaying on loop
- **Ghost follower** — a physics-spring shadow chasing the ghost leader (stiffness/damping/mass configurable)
- **Live leader** — User 2's actual finger
- **Live follower** — User 2's physics spring chasing their own finger

The synchrony relationship to measure: how well does User 2's **live follower** match the **ghost follower**?

---

## Candidate Metrics

### Spatial closeness (frame-by-frame)

| Metric | What it measures | Notes |
|---|---|---|
| **Mean follower distance** | Average pixel distance between live follower and ghost follower over time | Simple, interpretable — "stayed within 50px on average" |
| **% time within threshold** | Fraction of session where live follower was within N pixels of ghost follower | Good cooperative high score: "stayed in sync 87% of the time" |
| **Peak deviation** | Worst-case distance excursion | Punishes momentary lapses — more competitive feel |
| **Normalized path deviation** | Distance from ghost follower's path line (not just current position) | Rewards tracing the same *shape*, tolerates timing offset |

### Temporal / phase

| Metric | What it measures | Notes |
|---|---|---|
| **Phase lag** | How many ms behind the ghost follower User 2's follower is | Spring physics already introduce lag — this measures *additional* lag on top |
| **Velocity matching** | Difference in speed vectors between the two followers | Sensitive to *how* they move, not just *where* |
| **Loop cycle match** | How many ghost loops did User 2 successfully shadow | Natural "lives" mechanic |

### Energy / effort

| Metric | What it measures | Notes |
|---|---|---|
| **Path length ratio** | User 2's total path length vs. ghost's path length | Did they over- or under-compensate? |
| **Jerk / smoothness** | 3rd derivative of position | Rewards graceful movement, punishes panic corrections |

---

## Cooperative Mode

**Primary metric: Synchrony score** — % of time both followers are within a threshold distance, accumulated over a fixed time window (60–90 seconds). Produces a 0–100% score suitable for a leaderboard.

**Why this works:**
- User 1 shapes the recording to be followable — the cooperative tension is them calibrating difficulty for their stranger-partner
- User 2 tries to mirror it
- Natural difficulty dial: tighten the threshold (30px vs. 60px) to raise the bar
- A secondary **bonus multiplier** based on smoothness rewards fluid movement over frantic correction near the threshold

**Time limit:** Fixed (60s feels natural — long enough to build rhythm, short enough to retry).

**User 1 motivation:** Make a recording that's *challenging but fair*. Their score depends on User 2 being able to follow.

---

## Competitive Mode

User 1 tries to *lose* User 2, like a bucking bronco. Skilled User 1s learn to exploit inertia — sharp reversals, sudden stops — since they know User 2 has spring physics to contend with.

**Score:** Time-until-lose — User 2 "loses" when their follower drifts more than N pixels from the ghost follower for more than M consecutive seconds.

**Duration:** Open-ended. No time cap; the game ends when User 2 is shaken off.

**Fairness mechanic:** User 2 sees the ghost follower's trail as their target. User 1's physics config (damping/mass) for the ghost is set to a fixed standard value so the target is reproducible and fair, regardless of how User 1 originally configured their session.

**Escalation idea:** The threshold N tightens or the ghost follower's physics get snappier as time goes on, making it progressively harder for User 2 to hold on.

---

## Implementation Starting Point

The % time within threshold metric is the simplest first step and unlocks most of the above. It requires only one addition to the `tick()` loop in `useAnimation.ts`:

```ts
// each frame:
const dx = liveFollower.x - ghostFollower.x
const dy = liveFollower.y - ghostFollower.y
const dist = Math.sqrt(dx * dx + dy * dy)
if (dist < SYNC_THRESHOLD_PX) syncHits++
totalFrames++
// score = syncHits / totalFrames
```

Everything else (phase lag, velocity matching, smoothness) is derived from data already computed in the tick loop.
