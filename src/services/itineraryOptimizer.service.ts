import { prisma } from "../database/client.js";

// ==================== Type Definitions ====================

type PlaceCategory = "ATTRACTIONS" | "DINING" | "FESTIVALS" | "STAYS" | "SHOPPING";

type PlaceData = {
  id: string;
  name: string;
  category: PlaceCategory;
  latitude: number | null;
  longitude: number | null;
  averageRating: number;
  ratingCount: number;
  estimatedVisitDuration: number | null;
  recommendedTimeOfDay: string | null;
  priceLevel: number | null;
  hasPromotion: boolean;
};

type OptimizationConstraints = {
  startDate: Date;
  endDate: Date;
  dailyStartTime: string; // "HH:MM"
  dailyEndTime: string; // "HH:MM"
  maxBudget?: number;
  preferenceWeights?: Record<string, number>;
};

type OptimizedActivity = {
  placeId: string;
  title: string;
  scheduledTime: string; // "HH:MM"
  period: "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
  estimatedCost: number;
  estimatedDuration: number; // minutes
  travelFromPrevious: number; // minutes
  travelDistance: number; // km
  sortOrder: number;
};

type OptimizedDay = {
  dayNumber: number;
  date: Date;
  activities: OptimizedActivity[];
  totalEstimatedCost: number;
  totalDuration: number; // minutes
  totalTravelDistance: number; // km
};

type OptimizationResult = {
  days: OptimizedDay[];
  summary: {
    totalPlaces: number;
    totalEstimatedCost: number;
    totalDuration: number;
    averageDailyDuration: number;
    totalTravelDistance: number;
    unassignedPlaces: string[];
  };
};

// ==================== Constants ====================

const TRAVEL_SPEED_KMH = 30;
const MAX_PLACES_PER_DAY = 8;
const DEFAULT_VISIT_DURATIONS: Record<PlaceCategory, number> = {
  ATTRACTIONS: 120,
  DINING: 60,
  FESTIVALS: 180,
  SHOPPING: 90,
  STAYS: 0,
};

// ==================== Utility Functions ====================

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function estimateTravelTime(distanceKm: number): number {
  return Math.round((distanceKm / TRAVEL_SPEED_KMH) * 60);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function determinePeriod(hour: number): "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT" {
  if (hour < 12) return "MORNING";
  if (hour < 17) return "AFTERNOON";
  return "EVENING";
}

function normalizeRating(rating: number): number {
  return rating / 5;
}

function normalizePopularity(count: number): number {
  return Math.log1p(count) / Math.log1p(1000);
}

function getDefaultVisitDuration(place: PlaceData): number {
  if (place.estimatedVisitDuration && place.estimatedVisitDuration > 0) {
    return place.estimatedVisitDuration;
  }
  return DEFAULT_VISIT_DURATIONS[place.category];
}

// ==================== Core Algorithms ====================

interface ScoredPlace extends PlaceData {
  score: number;
}

function calculatePlaceScore(
  place: PlaceData,
  preferenceWeights: Record<string, number> = {}
): number {
  const normalizedRating = normalizeRating(place.averageRating);
  const normalizedPopularity = normalizePopularity(place.ratingCount);
  const preferenceWeight = preferenceWeights[place.category] ?? 0.5;
  const promotionBonus = place.hasPromotion ? 1 : 0;

  const score =
    0.3 * normalizedRating +
    0.3 * preferenceWeight +
    0.2 * normalizedPopularity +
    0.2 * promotionBonus;

  return score;
}

/**
 * Safely calculate haversine distance, returning Infinity if either place lacks coordinates.
 */
function safeDistance(p1: PlaceData, p2: PlaceData): number {
  if (p1.latitude == null || p1.longitude == null || p2.latitude == null || p2.longitude == null) {
    return 0; // Can't calculate distance; assume 0 travel
  }
  return haversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
}

/**
 * Calculate total estimated time for a day's places including travel between them.
 * Uses Haversine distance for realistic travel time estimation.
 */
function estimateDayTime(places: PlaceData[]): number {
  if (places.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < places.length; i++) {
    total += getDefaultVisitDuration(places[i]);
    if (i > 0) {
      const dist = safeDistance(places[i - 1], places[i]);
      total += estimateTravelTime(dist);
    }
  }
  return total;
}

function greedyDayAssignment(
  scoredPlaces: ScoredPlace[],
  days: Date[],
  constraints: OptimizationConstraints
): Map<number, PlaceData[]> {
  const assignment = new Map<number, PlaceData[]>();

  // Initialize empty arrays for each day
  days.forEach((_, index) => assignment.set(index, []));

  const dailyStartMinutes = timeToMinutes(constraints.dailyStartTime);
  const dailyEndMinutes = timeToMinutes(constraints.dailyEndTime);
  const totalDailyMinutes = dailyEndMinutes - dailyStartMinutes;

  // Sort places by score descending
  const sortedPlaces = [...scoredPlaces].sort((a, b) => b.score - a.score);

  for (const scoredPlace of sortedPlaces) {
    const { score, ...place } = scoredPlace;
    let bestDay = -1;
    let bestDayScore = -Infinity;

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const dayPlaces = assignment.get(dayIndex)!;

      if (dayPlaces.length >= MAX_PLACES_PER_DAY) {
        continue;
      }

      // Simulate adding this place to the day and check total time
      const candidateDay = [...dayPlaces, place];
      const estimatedTotalMinutes = estimateDayTime(candidateDay);

      if (estimatedTotalMinutes > totalDailyMinutes) {
        continue; // Doesn't fit in this day
      }

      let proximityBonus = 0;
      if (dayPlaces.length > 0) {
        const lastPlace = dayPlaces[dayPlaces.length - 1];
        const distance = safeDistance(lastPlace, place);
        proximityBonus = Math.max(0, 1 - distance / 10); // Decay over 10km
      } else {
        proximityBonus = 0.5; // Bonus for starting a day
      }

      const dayScore = score + 0.3 * proximityBonus;

      if (dayScore > bestDayScore) {
        bestDayScore = dayScore;
        bestDay = dayIndex;
      }
    }

    if (bestDay !== -1) {
      assignment.get(bestDay)!.push(place);
    }
  }

  return assignment;
}

/**
 * Phase 3: 0/1 Knapsack DP with travel-aware verification.
 *
 * Standard knapsack uses per-item weights independently, but travel time
 * depends on the ORDER and PAIRING of items — not a simple additive weight.
 * Strategy:
 *   1. Run classic 0/1 Knapsack DP using visit-duration as weight
 *      (ignoring travel for now) → candidate set
 *   2. Optimize route order via nearest-neighbor TSP
 *   3. Verify total time (visit + travel) fits in daily capacity
 *   4. If overflow, iteratively remove the lowest-score place until it fits
 *
 * Complexity: O(n × capacity) for DP + O(n²) for TSP verification.
 */
function knapsackOptimization(
  dayPlaces: PlaceData[],
  constraints: OptimizationConstraints
): PlaceData[] {
  if (dayPlaces.length === 0) return [];

  const capacity = timeToMinutes(constraints.dailyEndTime) - timeToMinutes(constraints.dailyStartTime);
  const n = dayPlaces.length;

  // Build items with score and duration
  const items = dayPlaces.map((place) => ({
    place,
    weight: getDefaultVisitDuration(place), // visit duration only (travel added in verification)
    value: calculatePlaceScore(place, constraints.preferenceWeights),
  }));

  // --- Step 1: Classic 0/1 Knapsack DP ---
  // dp[i][w] = max total value using first i items with capacity w
  const dp: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { weight, value } = items[i - 1];
    for (let w = 0; w <= capacity; w++) {
      if (weight <= w) {
        dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weight] + value);
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // Backtrack to find selected items
  const dpSelected: { place: PlaceData; value: number }[] = [];
  let w = capacity;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      dpSelected.push({ place: items[i - 1].place, value: items[i - 1].value });
      w -= items[i - 1].weight;
    }
  }

  // --- Step 2: Optimize route order ---
  const orderedPlaces = optimizeRouteOrder(dpSelected.map((s) => s.place));

  // --- Step 3: Verify with real travel times ---
  const totalTime = estimateDayTime(orderedPlaces);

  if (totalTime <= capacity) {
    return orderedPlaces; // All fits — optimal!
  }

  // --- Step 4: Iteratively remove lowest-value place until it fits ---
  // Create a value map for efficient lookup
  const valueMap = new Map(dpSelected.map((s) => [s.place.id, s.value]));
  let candidate = [...orderedPlaces];

  while (candidate.length > 0) {
    // Find the place with lowest score among candidates
    let minIdx = 0;
    let minVal = Infinity;
    for (let i = 0; i < candidate.length; i++) {
      const val = valueMap.get(candidate[i].id) ?? 0;
      if (val < minVal) {
        minVal = val;
        minIdx = i;
      }
    }

    // Remove the weakest place
    candidate.splice(minIdx, 1);

    // Re-optimize route and check
    candidate = optimizeRouteOrder(candidate);
    if (estimateDayTime(candidate) <= capacity) {
      break;
    }
  }

  return candidate;
}

function optimizeRouteOrder(places: PlaceData[]): PlaceData[] {
  if (places.length <= 1) return places;

  // Build distance matrix
  const n = places.length;
  const distMatrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      distMatrix[i][j] = safeDistance(places[i], places[j]);
    }
  }

  // Nearest neighbor heuristic
  const visited = new Set<number>();
  const ordered: PlaceData[] = [];
  let currentIdx = 0;

  visited.add(currentIdx);
  ordered.push(places[currentIdx]);

  while (visited.size < n) {
    let nearestIdx = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) {
        const dist = distMatrix[currentIdx][i];
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
    }

    if (nearestIdx !== -1) {
      visited.add(nearestIdx);
      ordered.push(places[nearestIdx]);
      currentIdx = nearestIdx;
    } else {
      break;
    }
  }

  return ordered;
}

function buildSchedule(
  orderedPlaces: PlaceData[],
  dayDate: Date,
  dailyStartTime: string,
  dailyEndTime: string,
  dayNumber: number
): OptimizedDay {
  const activities: OptimizedActivity[] = [];
  let currentTime = timeToMinutes(dailyStartTime);
  const endMinutes = timeToMinutes(dailyEndTime);
  let totalCost = 0;
  let totalDuration = 0;
  let totalTravelDistance = 0;

  let previousPlace: PlaceData | null = null;
  let sortOrder = 0;

  for (const place of orderedPlaces) {
    const visitDuration = getDefaultVisitDuration(place);
    const dist = previousPlace ? safeDistance(previousPlace, place) : 0;
    const travelFromPrevious = previousPlace ? estimateTravelTime(dist) : 0;
    const travelDistance = dist;

    const arrivalTime = currentTime + travelFromPrevious;

    // Skip this place if arrival + visit would exceed daily end time
    if (arrivalTime + visitDuration > endMinutes) {
      break;
    }

    currentTime = arrivalTime;
    const scheduledTime = minutesToTime(currentTime);
    const hour = Math.floor(currentTime / 60);
    const period = determinePeriod(hour);

    const estimatedCost = place.priceLevel ?? 0;

    activities.push({
      placeId: place.id,
      title: place.name,
      scheduledTime,
      period,
      estimatedCost,
      estimatedDuration: visitDuration,
      travelFromPrevious,
      travelDistance,
      sortOrder,
    });

    totalCost += estimatedCost;
    totalDuration += visitDuration;
    totalTravelDistance += travelDistance;
    currentTime += visitDuration;
    sortOrder++;

    previousPlace = place;
  }

  return {
    dayNumber,
    date: dayDate,
    activities,
    totalEstimatedCost: totalCost,
    totalDuration,
    totalTravelDistance,
  };
}

// ==================== Main Algorithm ====================

async function optimizeItinerary(
  placeIds: string[],
  constraints: OptimizationConstraints
): Promise<OptimizationResult> {
  // Fetch places from database
  const places = await prisma.place.findMany({
    where: {
      id: { in: placeIds },
      status: "APPROVED",
    },
    select: {
      id: true,
      name: true,
      category: true,
      latitude: true,
      longitude: true,
      averageRating: true,
      ratingCount: true,
      estimatedVisitDuration: true,
      recommendedTimeOfDay: true,
      priceLevel: true,
    },
  });

  if (places.length === 0) {
    return {
      days: [],
      summary: {
        totalPlaces: 0,
        totalEstimatedCost: 0,
        totalDuration: 0,
        averageDailyDuration: 0,
        totalTravelDistance: 0,
        unassignedPlaces: placeIds,
      },
    };
  }

  // Fetch active promotions
  const promotionPlaceIds = new Set(
    (
      await prisma.promotion.findMany({
        where: {
          placeId: { in: placeIds },
          isActive: true,
        },
        select: { placeId: true },
      })
    ).map((p) => p.placeId)
  );

  // Add promotion flag to places
  const enrichedPlaces: PlaceData[] = places.map((place) => ({
    ...place,
    category: place.category as PlaceCategory,
    hasPromotion: promotionPlaceIds.has(place.id),
  }));

  // Calculate scores
  const scoredPlaces: ScoredPlace[] = enrichedPlaces.map((place) => ({
    ...place,
    score: calculatePlaceScore(place, constraints.preferenceWeights),
  }));

  // Generate days array
  const days: Date[] = [];
  const current = new Date(constraints.startDate);
  while (current <= constraints.endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // Phase 2: Greedy day assignment
  const dayAssignment = greedyDayAssignment(scoredPlaces, days, constraints);

  // Build optimized days
  const optimizedDays: OptimizedDay[] = [];
  const assignedPlaceIds = new Set<string>();

  for (const [dayIndex, dayPlaces] of dayAssignment.entries()) {
    if (dayPlaces.length === 0) continue;

    // Phase 3: Knapsack optimization
    const selectedPlaces = knapsackOptimization(dayPlaces, constraints);

    if (selectedPlaces.length === 0) continue;

    selectedPlaces.forEach((p) => assignedPlaceIds.add(p.id));

    // Phase 4: Route optimization
    const orderedPlaces = optimizeRouteOrder(selectedPlaces);

    // Build schedule
    const optimizedDay = buildSchedule(
      orderedPlaces,
      days[dayIndex],
      constraints.dailyStartTime,
      constraints.dailyEndTime,
      dayIndex + 1
    );

    optimizedDays.push(optimizedDay);
  }

  // Collect unassigned places
  const unassignedPlaces = enrichedPlaces
    .filter((p) => !assignedPlaceIds.has(p.id))
    .map((p) => p.id);

  // Calculate summary
  const totalPlaces = assignedPlaceIds.size;
  const totalEstimatedCost = optimizedDays.reduce(
    (sum, day) => sum + day.totalEstimatedCost,
    0
  );
  const totalDuration = optimizedDays.reduce(
    (sum, day) => sum + day.totalDuration,
    0
  );
  const averageDailyDuration =
    optimizedDays.length > 0 ? totalDuration / optimizedDays.length : 0;
  const totalTravelDistance = optimizedDays.reduce(
    (sum, day) => sum + day.totalTravelDistance,
    0
  );

  return {
    days: optimizedDays,
    summary: {
      totalPlaces,
      totalEstimatedCost,
      totalDuration,
      averageDailyDuration,
      totalTravelDistance,
      unassignedPlaces,
    },
  };
}

async function getPlaceDuration(placeId: string): Promise<number> {
  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: {
      estimatedVisitDuration: true,
      category: true,
    },
  });

  if (!place) {
    throw new Error(`Place not found: ${placeId}`);
  }

  const duration =
    place.estimatedVisitDuration && place.estimatedVisitDuration > 0
      ? place.estimatedVisitDuration
      : DEFAULT_VISIT_DURATIONS[place.category as PlaceCategory];

  return duration;
}

// ==================== Export ====================

export const itineraryOptimizerService = {
  optimizeItinerary,
  getPlaceDuration,
};
