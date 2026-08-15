"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin/auth";
import {
  MARKETING_AUTOMATION_SETTINGS,
  isMarketingAutomationSettingKey,
} from "@/lib/admin/marketing-settings";
import { prisma } from "@/lib/prisma";
import { clearMarketingAutomationGateCache } from "@/lib/admin/marketing-automation";
import { marketingSettingInputSchema } from "@/lib/validation/admin-inputs";
import { validationMessage } from "@/lib/validation/common-inputs";

export async function updateMarketingAutomationSettingAction(key: string, enabled: boolean) {
  try {
    const session = await assertAdmin();
    const parsed = marketingSettingInputSchema.safeParse({ key, enabled });
    if (!parsed.success) return { success: false, message: validationMessage(parsed.error) };
    key = parsed.data.key;
    enabled = parsed.data.enabled;

    if (!isMarketingAutomationSettingKey(key)) {
      return { success: false, message: "Unknown marketing automation setting." };
    }

    const setting = MARKETING_AUTOMATION_SETTINGS.find((item) => item.key === key);
    if (!setting) {
      return { success: false, message: "Unknown marketing automation setting." };
    }

    const actor = session.user?.email || session.user?.id || "ADMIN";
    const previous = await prisma.globalSetting.findUnique({
      where: { key },
      select: { enabled: true },
    });

    if (previous?.enabled === enabled) {
      return {
        success: true,
        message: `${setting.label} is already ${enabled ? "enabled" : "disabled"}.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.globalSetting.upsert({
        where: { key },
        update: {
          enabled,
          label: setting.label,
          description: setting.description,
          category: "MARKETING_AUTOMATION",
          updatedBy: actor,
        },
        create: {
          key,
          label: setting.label,
          description: setting.description,
          category: "MARKETING_AUTOMATION",
          enabled,
          updatedBy: actor,
        },
      });

      await tx.globalSettingAudit.create({
        data: {
          settingKey: key,
          previousValue: previous?.enabled ?? null,
          newValue: enabled,
          actor,
          note: `${setting.label} ${enabled ? "enabled" : "disabled"} from admin marketing controls.`,
        },
      });
    });

    revalidatePath("/admin/marketing");
    clearMarketingAutomationGateCache(key);

    return {
      success: true,
      message: `${setting.label} ${enabled ? "enabled" : "disabled"}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update marketing setting.";
    return { success: false, message };
  }
}
