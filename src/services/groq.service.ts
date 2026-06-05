import Groq from "groq-sdk";
import { prisma } from "../database/client.js";
import { env } from "../config/env.js";
import { toNumberOrDefault } from "../utils/number.js";

const groq = new Groq({
  apiKey: env.groqApiKey,
});

export const groqService = {
  async chat(userId: number, messages: any[]) {
    const tools = [
      {
        type: "function",
        function: {
          name: "getUserTrips",
          description: "Lấy danh sách tất cả các chuyến đi của người dùng.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "getTripDetails",
          description: "Lấy chi tiết lịch trình và hoạt động của một chuyến đi.",
          parameters: {
            type: "object",
            properties: {
              tripId: { type: "string", description: "ID của chuyến đi" },
            },
            required: ["tripId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getBudgetSummary",
          description: "Xem ngân sách và tổng chi phí của chuyến đi.",
          parameters: {
            type: "object",
            properties: {
              tripId: { type: "string", description: "ID của chuyến đi" },
            },
            required: ["tripId"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getUserFavorites",
          description: "Lấy danh sách địa điểm yêu thích đã lưu.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "getUserProfile",
          description: "Lấy thông tin cá nhân của người dùng.",
          parameters: { type: "object", properties: {} },
        },
      },
    ];

    const systemPrompt = `BẠN LÀ TRỢ LÝ CÁ NHÂN TRAVEL AI. BẠN CÓ QUYỀN TRUY CẬP DỮ LIỆU NGƯỜI DÙNG.

    NGUYÊN TẮC TỐI THƯỢNG:
    1. Khi người dùng hỏi "hiện tại có bao nhiêu chuyến đi" hoặc bất cứ thứ gì về dữ liệu của họ, bạn PHẢI gọi tool 'getUserTrips' hoặc tool tương ứng NGAY LẬP TỨC.
    2. TUYỆT ĐỐI KHÔNG trả lời rằng bạn "không có thông tin cụ thể" hoặc "cần người dùng cung cấp thêm thông tin". Bạn có tools, hãy dùng chúng.
    3. Trả lời ngắn gọn, thân thiện bằng Tiếng Việt.
    4. Nếu kết quả từ tool là trống, hãy báo là người dùng chưa có dữ liệu đó.

    ID NGƯỜI DÙNG: ${userId}`;

    // Load recent history from DB
    const dbHistory = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...dbHistory.map(m => ({ role: m.role, content: m.content })),
      ...messages
    ];

    let response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: fullMessages as any,
      tools: tools as any,
      tool_choice: "auto",
    });

    let responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
      const toolCalls = responseMessage.tool_calls;
      const availableFunctions: any = {
        getUserTrips: () => this.getUserTrips(userId),
        getTripDetails: (args: { tripId: string }) => this.getTripDetails(userId, args.tripId),
        getBudgetSummary: (args: { tripId: string }) => this.getBudgetSummary(userId, args.tripId),
        getUserFavorites: () => this.getUserFavorites(userId),
        getUserProfile: () => this.getUserProfile(userId),
      };

      const toolMessages = [...fullMessages, responseMessage];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionToCall = availableFunctions[functionName];
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const functionResponse = await functionToCall(functionArgs);

        toolMessages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functionName,
          content: JSON.stringify(functionResponse),
        } as any);
      }

      const secondResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: toolMessages as any,
      });

      responseMessage = secondResponse.choices[0].message;
    }

    // Save user message and assistant response to DB
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      await prisma.chatMessage.create({
        data: { userId, role: "user", content: lastUserMsg.content },
      });
    }

    await prisma.chatMessage.create({
      data: { userId, role: "assistant", content: responseMessage.content || "" },
    });

    return responseMessage;
  },

  async getUserTrips(userId: number) {
    const trips = await prisma.trip.findMany({ where: { userId } });
    return trips;
  },

  async getTripDetails(userId: number, tripId: string) {
    return await prisma.trip.findFirst({
      where: { id: tripId, userId },
      include: { days: { include: { activities: true } } },
    });
  },

  async getBudgetSummary(userId: number, tripId: string) {
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId },
      include: { days: { include: { activities: true } } },
    });
    if (!trip) return { error: "Trip not found" };
    let cost = 0;
    trip.days.forEach((day) => {
      day.activities.forEach((activity) => {
        cost += toNumberOrDefault(activity.estimatedCost);
      });
    });
    const budget = toNumberOrDefault(trip.budget);
    return { title: trip.title, budget, cost, remaining: budget - cost };
  },

  async getUserFavorites(userId: number) {
    const favs = await prisma.favorite.findMany({
      where: { userId },
      include: { place: true },
    });
    return favs.map(f => f.place);
  },

  async getUserProfile(userId: number) {
    return await prisma.user.findUnique({ where: { id: userId } });
  },
};
