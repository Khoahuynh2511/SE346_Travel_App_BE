import { z } from "zod";
import { groqService } from "./groq.service.js";

const tripPlanSchema = z.object({
  query: z.string().min(1).max(500),
  location: z.string().optional(),
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
});

export const aiService = {
  planTrip(body: unknown) {
    const data = tripPlanSchema.parse(body);
    const where = data.location?.trim() || "your area";
    return {
      query: data.query,
      location: where,
      suggestions: [
        {
          title: `Morning: explore ${where}`,
          description: `Based on "${data.query}", start with local attractions and cafes.`,
          duration: "3-4 hours",
        },
        {
          title: "Afternoon: food and culture",
          description: "Try popular dining spots and a short walking tour.",
          duration: "4-5 hours",
        },
        {
          title: "Evening: relax and views",
          description: "End the day at a scenic spot or night market if available.",
          duration: "2-3 hours",
        },
      ],
      note: "AI planner is in preview. Connect a real LLM provider for personalized results.",
    };
  },

  async chat(userId: number, body: unknown) {
    const data = chatSchema.parse(body);
    return await groqService.chat(userId, data.messages);
  },
};
