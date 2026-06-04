import { prisma } from "../database/client.js";
import { notDeleted } from "../utils/softDelete.js";

// ==================== Type Definitions ====================

type PlaceCategoryType = "ATTRACTIONS" | "DINING" | "FESTIVALS" | "STAYS" | "SHOPPING";

interface PlaceData {
  id: string;
  name: string;
  region: string;
  category: PlaceCategoryType;
  coverImageUrl: string;
  featureLabel: string;
  averageRating: number;
  ratingCount: number;
  about: string;
  priceLevel: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface UserProfileVector {
  userId: number;
  categoryAffinity: Record<PlaceCategoryType, number>;
  pricePreference: { average: number; min: number; max: number };
  regionAffinity: Record<string, number>;
  lastFavoritePlaceId: string | null;
  favoritePlaceIds: Set<string>;
  topCategory: PlaceCategoryType | null;
}

interface ScoredPlace {
  place: PlaceData;
  score: number;
  explanation: string;
}

interface RecommendationResult {
  contentBased: ScoredPlace[];
  serendipity: ScoredPlace[];
  collaborative: ScoredPlace[];
  tfidfSimilar: ScoredPlace[];
  trending: ScoredPlace[];
}

interface RecommendationOptions {
  limit?: number;
}

// ==================== Constants ====================

const STOP_WORDS = new Set([
  'là', 'có', 'và', 'của', 'cho', 'với', 'như', 'này', 'đó', 'không', 'được',
  'trên', 'tại', 'từ', 'về', 'một', 'hai', 'ba', 'nhiều', 'các', 'đã', 'sẽ',
  'đang', 'rất', 'nữa', 'ra', 'vào', 'lên', 'xuống', 'qua', 'để', 'mà',
  'thì', 'nhưng', 'hoặc', 'vì', 'khi', 'nếu', 'hay'
]);

const CATEGORY_LABELS: Record<PlaceCategoryType, string> = {
  ATTRACTIONS: "điểm tham quan",
  DINING: "ẩm thực",
  FESTIVALS: "lễ hội",
  STAYS: "lưu trú",
  SHOPPING: "mua sắm"
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    try {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function toNumberOrDefault(value: unknown, fallback = 0): number {
  return toNumberOrNull(value) ?? fallback;
}

// ==================== Utility Functions ====================

function getCategoryLabel(category: PlaceCategoryType): string {
  return CATEGORY_LABELS[category];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysSince(date: Date): number {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ==================== TF-IDF System ====================

function tokenizeVietnameseText(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length >= 3)
    .filter(word => !STOP_WORDS.has(word));
  return words;
}

function buildTFIDFMatrix(places: PlaceData[]): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();
  const docFreq = new Map<string, number>();
  const totalDocs = places.length;

  // First pass: build term frequency and document frequency
  const termFreqMaps: Array<Map<string, number>> = [];

  for (const place of places) {
    const text = `${place.featureLabel} ${place.about}`;
    const tokens = tokenizeVietnameseText(text);
    const tfMap = new Map<string, number>();
    const tokenSet = new Set(tokens);

    // Count term frequency
    for (const token of tokens) {
      tfMap.set(token, (tfMap.get(token) || 0) + 1);
    }

    // Update document frequency
    for (const token of tokenSet) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }

    termFreqMaps.push(tfMap);
  }

  // Second pass: compute TF-IDF weights
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const tfMap = termFreqMaps[i];
    const tfidfMap = new Map<string, number>();

    const maxCount = Math.max(...tfMap.values());

    for (const [term, count] of tfMap.entries()) {
      const tf = 0.5 + 0.5 * (count / maxCount);
      const df = docFreq.get(term) || 0;
      const idf = Math.log(totalDocs / (df + 1));
      const tfidf = tf * idf;
      tfidfMap.set(term, tfidf);
    }

    matrix.set(place.id, tfidfMap);
  }

  return matrix;
}

function getTFIDFMatrix(places: PlaceData[]): Map<string, Map<string, number>> {
  return buildTFIDFMatrix(places);
}

function cosineSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>
): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  // Calculate dot product and magnitude of A
  for (const [term, weightA] of vecA.entries()) {
    const weightB = vecB.get(term) || 0;
    dotProduct += weightA * weightB;
    magA += weightA * weightA;
  }

  // Calculate magnitude of B
  for (const weightB of vecB.values()) {
    magB += weightB * weightB;
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

// ==================== User Profile Building ====================

async function buildUserProfile(userId: number): Promise<UserProfileVector> {
  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      place: { ...notDeleted, status: "APPROVED" },
    },
    include: {
      place: {
        select: {
          id: true,
          category: true,
          priceLevel: true,
          region: true,
        }
      }
    },
    orderBy: { saveAt: 'desc' }
  });

  const reviews = await prisma.review.findMany({
    where: {
      userId,
      ...notDeleted,
      place: { ...notDeleted, status: "APPROVED" },
    },
    include: {
      place: {
        select: {
          id: true,
          category: true,
          priceLevel: true,
          region: true,
        }
      }
    }
  });

  const tripActivities = await prisma.tripActivity.findMany({
    where: {
      tripDay: {
        trip: { userId, ...notDeleted }
      },
      placeId: { not: null },
      place: { ...notDeleted, status: "APPROVED" },
    },
    include: {
      place: {
        select: {
          id: true,
          category: true,
        }
      }
    }
  });

  // Initialize category affinity
  const categoryAffinity: Record<PlaceCategoryType, number> = {
    ATTRACTIONS: 0,
    DINING: 0,
    FESTIVALS: 0,
    STAYS: 0,
    SHOPPING: 0
  };

  // Calculate category affinity from favorites
  for (const fav of favorites) {
    const days = daysSince(fav.saveAt);
    const weight = Math.exp(-days / 30) * 2.0;
    categoryAffinity[fav.place.category as PlaceCategoryType] += weight;
  }

  // Add category affinity from reviews
  for (const review of reviews) {
    const weight = (review.rating / 5) * 1.5;
    categoryAffinity[review.place.category as PlaceCategoryType] += weight;
  }

  // Add category affinity from trip activities
  for (const activity of tripActivities) {
    if (activity.place) {
      categoryAffinity[activity.place.category as PlaceCategoryType] += 0.5;
    }
  }

  // Normalize category affinity
  const totalAffinity = Object.values(categoryAffinity).reduce((sum, val) => sum + val, 0);
  if (totalAffinity > 0) {
    for (const category of Object.keys(categoryAffinity) as PlaceCategoryType[]) {
      categoryAffinity[category] /= totalAffinity;
    }
  } else {
    // Default equal distribution
    for (const category of Object.keys(categoryAffinity) as PlaceCategoryType[]) {
      categoryAffinity[category] = 0.2;
    }
  }

  const priceLevels: number[] = [];
  for (const fav of favorites) {
    const price = toNumberOrNull(fav.place.priceLevel);
    if (price !== null) {
      priceLevels.push(price);
    }
  }
  for (const review of reviews) {
    if (review.rating >= 4) {
      const price = toNumberOrNull(review.place.priceLevel);
      if (price !== null) {
        priceLevels.push(price);
      }
    }
  }

  let pricePreference = { average: 2, min: 1, max: 4 };
  if (priceLevels.length > 0) {
    const avg = priceLevels.reduce((sum, p) => sum + p, 0) / priceLevels.length;
    pricePreference = {
      average: avg,
      min: Math.min(...priceLevels),
      max: Math.max(...priceLevels)
    };
  }

  // Calculate region affinity from favorites
  const regionCounts: Record<string, number> = {};
  for (const fav of favorites) {
    regionCounts[fav.place.region] = (regionCounts[fav.place.region] || 0) + 1;
  }

  const regionAffinity: Record<string, number> = {};
  const totalRegionCount = Object.values(regionCounts).reduce((sum, val) => sum + val, 0);
  if (totalRegionCount > 0) {
    for (const [region, count] of Object.entries(regionCounts)) {
      regionAffinity[region] = count / totalRegionCount;
    }
  }

  // Get last favorite place
  const lastFavoritePlaceId = favorites.length > 0 ? favorites[0].place.id : null;

  // Get all favorite place IDs
  const favoritePlaceIds = new Set(favorites.map(fav => fav.place.id));

  // Get top category
  let topCategory: PlaceCategoryType | null = null;
  let maxAffinity = 0;
  for (const [category, affinity] of Object.entries(categoryAffinity)) {
    if (affinity > maxAffinity) {
      maxAffinity = affinity;
      topCategory = category as PlaceCategoryType;
    }
  }

  return {
    userId,
    categoryAffinity,
    pricePreference,
    regionAffinity,
    lastFavoritePlaceId,
    favoritePlaceIds,
    topCategory
  };
}

// ==================== Content-Based Scoring ====================

function computeContentSimilarity(profile: UserProfileVector, place: PlaceData): number {
  const categoryScore = profile.categoryAffinity[place.category] || 0;

  let priceScore = 0.5;
  if (place.priceLevel !== null && profile.pricePreference.max > profile.pricePreference.min) {
    const priceDiff = Math.abs(place.priceLevel - profile.pricePreference.average);
    const priceRange = profile.pricePreference.max - profile.pricePreference.min;
    priceScore = 1 - (priceDiff / priceRange);
    priceScore = clamp(priceScore, 0, 1);
  }

  const regionScore = profile.regionAffinity[place.region] || 0;
  const ratingScore = (place.averageRating / 5) * 0.8;

  const finalScore =
    0.4 * categoryScore +
    0.2 * priceScore +
    0.2 * regionScore +
    0.2 * ratingScore;

  return clamp(finalScore, 0, 1);
}

// ==================== Serendipity Scoring ====================

async function computeSerendipityScore(
  profile: UserProfileVector,
  place: PlaceData,
  allPlaces: PlaceData[],
  tfidfMatrix: Map<string, Map<string, number>>
): Promise<number> {
  const relatedness = computeContentSimilarity(profile, place);

  // Must be somewhat related to be serendipitous
  if (relatedness < 0.2) return 0;

  // Calculate novelty based on TF-IDF similarity to favorited places
  let maxSimilarity = 0;
  const placeVector = tfidfMatrix.get(place.id);

  if (placeVector && profile.favoritePlaceIds.size > 0) {
    for (const favId of profile.favoritePlaceIds) {
      const favVector = tfidfMatrix.get(favId);
      if (favVector) {
        const sim = cosineSimilarity(placeVector, favVector);
        maxSimilarity = Math.max(maxSimilarity, sim);
      }
    }
  }

  const novelty = 1 - maxSimilarity;

  const serendipityScore = 0.6 * novelty + 0.4 * relatedness;
  return clamp(serendipityScore, 0, 1);
}

// ==================== Collaborative Filtering ====================

async function findSimilarUsers(userId: number, limit: number = 10): Promise<Array<{ userId: number; similarity: number }>> {
  const userFavorites = await prisma.favorite.findMany({
    where: { userId, place: { ...notDeleted, status: "APPROVED" } },
    select: { placeId: true }
  });
  const userFavIds = new Set(userFavorites.map(f => f.placeId));

  if (userFavIds.size === 0) return [];

  const overlappingUsers = await prisma.favorite.groupBy({
    by: ['userId'],
    where: {
      userId: { not: userId },
      placeId: { in: Array.from(userFavIds) },
      place: { ...notDeleted, status: "APPROVED" }
    },
    _count: { userId: true }
  });

  const similarUsers: Array<{ userId: number; similarity: number }> = [];

  for (const group of overlappingUsers) {
    const otherUserId = group.userId;
    const otherFavorites = await prisma.favorite.findMany({
      where: { userId: otherUserId, place: { ...notDeleted, status: "APPROVED" } },
      select: { placeId: true }
    });
    const otherFavIds = new Set(otherFavorites.map(f => f.placeId));

    // Calculate Jaccard similarity
    const intersection = new Set([...userFavIds].filter(id => otherFavIds.has(id)));
    const union = new Set([...userFavIds, ...otherFavIds]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;

    if (jaccard > 0) {
      similarUsers.push({ userId: otherUserId, similarity: jaccard });
    }
  }

  // Sort by similarity and limit
  similarUsers.sort((a, b) => b.similarity - a.similarity);
  return similarUsers.slice(0, limit);
}

async function getCollaborativeRecommendations(
  userId: number,
  profile: UserProfileVector,
  limit: number = 10
): Promise<ScoredPlace[]> {
  const similarUsers = await findSimilarUsers(userId, 10);

  if (similarUsers.length === 0) return [];

  const similarUserIds = similarUsers.map(u => u.userId);
  const candidateFavorites = await prisma.favorite.findMany({
    where: {
      userId: { in: similarUserIds },
      placeId: { notIn: Array.from(profile.favoritePlaceIds) },
      place: { ...notDeleted, status: "APPROVED" }
    },
    include: {
      place: {
        select: {
          id: true,
          name: true,
          region: true,
          category: true,
          coverImageUrl: true,
          featureLabel: true,
          averageRating: true,
          ratingCount: true,
          about: true,
          priceLevel: true,
          latitude: true,
          longitude: true,
        }
      }
    }
  });

  // Score each place by sum of similar user similarities
  const placeScores = new Map<string, number>();
  for (const fav of candidateFavorites) {
    const similarity = similarUsers.find(u => u.userId === fav.userId)?.similarity || 0;
    placeScores.set(fav.placeId, (placeScores.get(fav.placeId) || 0) + similarity);
  }

  // Normalize scores
  const maxScore = Math.max(...placeScores.values(), 1);

  const scoredPlaces: ScoredPlace[] = [];
  const processedPlaceIds = new Set<string>();

  for (const fav of candidateFavorites) {
    if (processedPlaceIds.has(fav.placeId)) continue;
    processedPlaceIds.add(fav.placeId);

    const rawScore = placeScores.get(fav.placeId) || 0;
    const normalizedScore = rawScore / maxScore;

    const rawPlace = fav.place as any;
    scoredPlaces.push({
      place: {
        id: rawPlace.id,
        name: rawPlace.name,
        region: rawPlace.region,
        category: rawPlace.category as PlaceCategoryType,
        coverImageUrl: rawPlace.coverImageUrl,
        featureLabel: rawPlace.featureLabel,
        averageRating: toNumberOrDefault(rawPlace.averageRating),
        ratingCount: toNumberOrDefault(rawPlace.ratingCount),
        about: rawPlace.about,
        priceLevel: toNumberOrNull(rawPlace.priceLevel),
        latitude: toNumberOrNull(rawPlace.latitude),
        longitude: toNumberOrNull(rawPlace.longitude),
      },
      score: normalizedScore,
      explanation: "Người dùng có sở thích tương tự cũng thích"
    });
  }

  // Sort by score and limit
  scoredPlaces.sort((a, b) => b.score - a.score);
  return scoredPlaces.slice(0, limit);
}

// ==================== TF-IDF Similar Places ====================

async function findSimilarPlaces(placeId: string, limit: number = 10): Promise<ScoredPlace[]> {
  // Fetch all approved places
  const allPlaces = await getAllPlaces();
  const targetPlace = allPlaces.find(p => p.id === placeId);

  if (!targetPlace) return [];

  // Build or get cached TF-IDF matrix
  const tfidfMatrix = getTFIDFMatrix(allPlaces);
  const targetVector = tfidfMatrix.get(placeId);

  if (!targetVector) return [];

  // Calculate similarities
  const similarities: Array<{ place: PlaceData; score: number }> = [];

  for (const place of allPlaces) {
    if (place.id === placeId) continue;

    const placeVector = tfidfMatrix.get(place.id);
    if (placeVector) {
      const similarity = cosineSimilarity(targetVector, placeVector);
      if (similarity > 0) {
        similarities.push({ place, score: similarity });
      }
    }
  }

  // Sort by score and limit
  similarities.sort((a, b) => b.score - a.score);
  const topSimilar = similarities.slice(0, limit);

  return topSimilar.map(s => ({
    place: s.place,
    score: s.score,
    explanation: "Tương tự về nội dung và đặc điểm"
  }));
}

// ==================== Trending Places ====================

function getTrendingPlaces(allPlaces: PlaceData[], limit: number): ScoredPlace[] {
  const scored = allPlaces.map(place => {
    // Use log-normalized popularity score
    const popularityScore = Math.log(1 + place.ratingCount) / Math.log(1 + 5000);
    return {
      place,
      score: popularityScore,
      explanation: "Đang thịnh hành"
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ==================== Data Fetching ====================

async function getAllPlaces(): Promise<PlaceData[]> {
  const places = await prisma.place.findMany({
    where: {
      status: "APPROVED",
      ...notDeleted,
    },
    select: {
      id: true,
      name: true,
      region: true,
      category: true,
      coverImageUrl: true,
      featureLabel: true,
      averageRating: true,
      ratingCount: true,
      about: true,
      priceLevel: true,
      latitude: true,
      longitude: true,
    }
  });

  const normalized: PlaceData[] = places.map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    category: p.category as PlaceCategoryType,
    coverImageUrl: p.coverImageUrl,
    featureLabel: p.featureLabel,
    averageRating: toNumberOrDefault(p.averageRating),
    ratingCount: toNumberOrDefault(p.ratingCount),
    about: p.about,
    priceLevel: toNumberOrNull(p.priceLevel),
    latitude: toNumberOrNull(p.latitude),
    longitude: toNumberOrNull(p.longitude),
  }));

  return normalized;
}

// ==================== Main Recommendation Function ====================

async function getRecommendations(
  userId: number,
  options: RecommendationOptions = {}
): Promise<RecommendationResult> {
  const limit = options.limit || 10;

  // Build user profile
  const profile = await buildUserProfile(userId);

  // Fetch all approved places not in user's favorites
  const allPlaces = await getAllPlaces();
  const candidatePlaces = allPlaces.filter(p => !profile.favoritePlaceIds.has(p.id));

  // Build TF-IDF matrix for similarity calculations
  const tfidfMatrix = getTFIDFMatrix(allPlaces);

  // 1. Content-based recommendations
  const contentBased: ScoredPlace[] = [];
  for (const place of candidatePlaces) {
    const score = computeContentSimilarity(profile, place);
    if (score > 0.3) {
      const explanation = profile.topCategory
        ? `Vì bạn thích ${getCategoryLabel(profile.topCategory)}`
        : "Dựa trên sở thích của bạn";
      contentBased.push({ place, score, explanation });
    }
  }
  contentBased.sort((a, b) => b.score - a.score);
  contentBased.splice(limit);

  // 2. Serendipity recommendations
  const serendipity: ScoredPlace[] = [];
  for (const place of candidatePlaces) {
    const score = await computeSerendipityScore(profile, place, allPlaces, tfidfMatrix);
    if (score > 0.4) {
      serendipity.push({
        place,
        score,
        explanation: "Khám phá điều mới mẻ"
      });
    }
  }
  serendipity.sort((a, b) => b.score - a.score);
  serendipity.splice(limit);

  // 3. Collaborative filtering recommendations
  const collaborative = await getCollaborativeRecommendations(userId, profile, limit);

  // 4. TF-IDF similar places (based on last favorite)
  const tfidfSimilar: ScoredPlace[] = [];
  if (profile.lastFavoritePlaceId) {
    const lastFavPlace = allPlaces.find(p => p.id === profile.lastFavoritePlaceId);
    const similar = await findSimilarPlaces(profile.lastFavoritePlaceId, limit);
    if (lastFavPlace) {
      tfidfSimilar.push(...similar.map(s => ({
        ...s,
        explanation: `Tương tự như ${lastFavPlace.name}`
      })));
    }
  }

  // 5. Trending places
  const trending = getTrendingPlaces(candidatePlaces, limit);

  return {
    contentBased,
    serendipity,
    collaborative,
    tfidfSimilar,
    trending
  };
}

// ==================== Export ====================

export const recommendationService = {
  getRecommendations,
  findSimilarPlaces,
  buildUserProfile
};
