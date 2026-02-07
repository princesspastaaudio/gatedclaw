import type { Bot } from "grammy";
import type { ApprovalMessenger } from "./service.js";
import type { ApprovalMessageRef, ApprovalRequest } from "./types.js";
import { editMessageTelegram, sendMessageTelegram } from "../telegram/send.js";

export type TelegramApprovalMessengerParams = {
  accountId?: string;
  api?: Bot["api"];
};

export function createTelegramApprovalMessenger(
  params: TelegramApprovalMessengerParams,
): ApprovalMessenger {
  return {
    async postCard({ request, text, buttons, targets }): Promise<ApprovalMessageRef[]> {
      const sent: ApprovalMessageRef[] = [];
      for (const target of targets) {
        const result = await sendMessageTelegram(target.chatId, text, {
          accountId: params.accountId,
          api: params.api,
          buttons,
        });
        sent.push({
          channel: "telegram",
          chatId: result.chatId,
          messageId: result.messageId,
        });
      }
      return sent;
    },
    async editCard({ message, text, buttons }) {
      await editMessageTelegram(message.chatId, message.messageId, text, {
        accountId: params.accountId,
        api: params.api,
        buttons,
      });
    },
    async notify({ chatId, text }) {
      await sendMessageTelegram(chatId, text, {
        accountId: params.accountId,
        api: params.api,
      });
    },
  };
}

export function buildTelegramApprovalActor(params: {
  chatId: string;
  userId?: string;
  username?: string;
}): ApprovalRequest["createdBy"] {
  return {
    channel: "telegram",
    chatId: params.chatId,
    userId: params.userId,
    username: params.username,
  };
}
