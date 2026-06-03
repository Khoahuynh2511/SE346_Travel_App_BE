# Groq AI Floating Chatbot Integration

Integrate Groq AI into the Travel App Backend to provide a floating chatbot that assists users with trip planning, budget management, and general travel information.

## User Review Required

> [!IMPORTANT]
> - **Actual Spending Data**: The current database schema only contains "estimated budget" and "estimated cost". I will use these for "chi tiêu" (spending) info unless a separate `Expense` model is requested.
> - **Groq API Key**: I will use the provided API key in `.env`.
> - **Chat History Persistence**: I plan to implement basic session-based history (likely passed from client or stored briefly). Do we need to save chat history permanently in the database?

## Proposed Changes

### 1. Environment & Dependencies

- Add `GROQ_API_KEY` to `.env`.
- Install `groq-sdk`.

### 2. Services

#### [NEW] [groq.service.ts](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/src/services/groq.service.ts)
- Initialize Groq client.
- Handle chat completion requests.
- Implement function calling logic to allow the AI to fetch database data.

#### [ai.service.ts](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/src/services/ai.service.ts)
- Replace mock `planTrip` with actual Groq logic.
- Add `chat` method for the floating chatbot.

### 3. Database Tools (Data Retrieval for AI)

I will implement helper functions in existing services (or a new dedicated one) that the AI can call via "Function Calling":
- `listUserTrips()`
- `getTripItinerary()`
- `getBudgetSummary()`
- `searchPlaces()`

### 4. Routes & Controllers

#### [ai.routes.ts](file:///C:/Users/PC/Documents/GitHub/SE346_Travel_App_BE/src/routes/ai.routes.ts)
- Add `POST /chat` endpoint.
- Protect with JWT middleware (since it needs `userId`).

---

## Verification Plan

### Automated Tests
- I will create a test script `scripts/test-groq.ts` to verify the connection and a simple chat completion.
- Unit tests for the data retrieval functions.

### Manual Verification
- Use Swagger UI (`/docs`) or `curl` to test the `/ai/chat` endpoint.
- Verify that the AI can correctly report trip budgets and activities from the database.
